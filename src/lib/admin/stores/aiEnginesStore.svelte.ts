// AI Engines Store - AI engine management state using Svelte 5 runes
import type { AIEngine, AIEngineModels, Branding } from '../types.js';
import {
  getAIEngines,
  updateAIEngine,
  validateAIEngineKey,
  getAIEngineModels,
  deleteAIEngineKey,
} from '../../api/admin/AiEngines.js';
import { getBranding, updateBranding } from '../../api/admin/branding.js';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';

type ApiKeyStatus = 'valid' | 'in_valid' | 'not_validated' | 'not_configured';
type ApiKeyMode = 'cta' | 'add' | 'view' | 'update';

function createAIEnginesStore() {
  let engines = $state<AIEngine[]>([]);
  let isLoading = $state(false);
  let error = $state<any | null>(null);
  let defaultEngineKey = $state<string | undefined>(undefined);

  // Modal state
  let showConfigModal = $state(false);
  let selectedEngine = $state<AIEngine | null>(null);

  // Models state
  let availableModels = $state<AIEngineModels | null>(null);
  let loadingModels = $state(false);
  let loadingOrganization = $state(false);

  // API key form state
  let apiKeyInput = $state('');
  let apiKeyStatus = $state<ApiKeyStatus>('not_configured');
  let apiKeyMessage = $state<string | null>(null);
  let apiKeyLoading = $state(false);
  let showApiKey = $state(false);
  let apiKeyMode = $state<ApiKeyMode>('cta');
  let apiKeyDeleteConfirm = $state(false);

  // Form data for configuring engines
  let formData = $state({
    is_enabled: true,
    whitelisted_models: [] as string[],
    default_model: null as string | null | undefined,
    is_default: false,
  });

  // Saving state
  let saving = $state(false);

  function getStatusMessage(status: ApiKeyStatus): string {
    const t = get(_);
    if (status === 'valid') return t('aiEngines.apiKey.valid');
    if (status === 'in_valid')
      return t('aiEngines.apiKey.invalidDetailed');
    if (status === 'not_validated')
      return t('aiEngines.apiKey.notValidated');
    return t('aiEngines.apiKey.notConfigured');
  }

  async function fetch() {
    isLoading = true;
    error = null;

    try {
      // Fetch engines and branding settings in parallel
      const [enginesData, branding] = await Promise.all([
        getAIEngines(),
        getBranding(),
      ]);

      // Store default engine key from branding settings
      defaultEngineKey = branding.settings?.default_engine;
      engines = enginesData;
    } catch (err: any) {
      error = err;
      throw err;
    } finally {
      isLoading = false;
    }
  }

  async function toggleEngineStatus(engine: AIEngine) {
    // Optimistically update the local state first for smooth animation
    const newStatus = !engine.is_enabled;
    const engineIndex = engines.findIndex((e) => e.engine_key === engine.engine_key);
    const originalStatus = engine.is_enabled;
    
    if (engineIndex !== -1) {
      engines[engineIndex] = {
        ...engines[engineIndex],
        is_enabled: newStatus,
      };
    }

    try {
      await updateAIEngine(engine.engine_key, {
        is_enabled: newStatus,
      });
      // Refresh to sync with server state after a short delay to allow animation to complete
      await new Promise((resolve) => setTimeout(resolve, 300));
      await fetch();
    } catch (err: any) {
      // Revert optimistic update on error
      if (engineIndex !== -1) {
        engines[engineIndex] = {
          ...engines[engineIndex],
          is_enabled: originalStatus,
        };
      }
      error = err;
      throw err;
    }
  }

  async function openConfigModal(engine: AIEngine) {
    selectedEngine = engine;

    // Initialize form data immediately with available engine data
    formData = {
      is_enabled: engine.is_enabled,
      whitelisted_models: engine.whitelisted_models || [],
      default_model: engine.default_model,
      is_default: false, // Will be updated when organization data loads
    };

    // Initialize API key state immediately
    apiKeyInput = '';
    apiKeyStatus = engine.api_key_status || 'not_configured';
    apiKeyMessage = getStatusMessage(apiKeyStatus);
    apiKeyMode = engine.api_key_configured ? 'view' : 'cta';
    showApiKey = false;
    apiKeyDeleteConfirm = false;

    // Set loading states immediately to prevent flash of "No models available"
    loadingModels = true;
    loadingOrganization = true;
    availableModels = null; // Reset to ensure clean state

    // Open modal immediately
    showConfigModal = true;

    // Load branding data and models asynchronously
    // Fetch current branding settings to get accurate default engine
    try {
      const branding = await getBranding();
      const isDefault = branding.settings?.default_engine === engine.engine_key;
      // Update cached default engine key
      defaultEngineKey = branding.settings?.default_engine;
      // Update form data with default engine status
      formData = {
        ...formData,
        is_default: isDefault,
      };
    } catch (err: any) {
      // Fallback to cached default engine key
      const isDefault = defaultEngineKey === engine.engine_key;
      formData = {
        ...formData,
        is_default: isDefault,
      };
    } finally {
      loadingOrganization = false;
    }

    // Load available models asynchronously
    try {
      availableModels = await getAIEngineModels(engine.engine_key);
    } catch (err: any) {
      error = err;
      availableModels = null;
    } finally {
      loadingModels = false;
    }
  }

  function closeConfigModal() {
    showConfigModal = false;
    selectedEngine = null;
    availableModels = null;
    apiKeyInput = '';
    apiKeyMessage = null;
    apiKeyLoading = false;
    apiKeyMode = 'cta';
    apiKeyDeleteConfirm = false;
  }

  async function refreshSelectedEngine() {
    if (!selectedEngine) return;
    await fetch();
    const refreshed = engines.find(
      (e) => e.engine_key === selectedEngine?.engine_key,
    );
    if (refreshed) {
      selectedEngine = refreshed;
      apiKeyStatus = refreshed.api_key_status || 'not_configured';
      apiKeyMessage = getStatusMessage(apiKeyStatus);
      apiKeyMode = refreshed.api_key_configured ? 'view' : 'cta';
    }
  }

  async function loadModelsForSelected() {
    if (!selectedEngine) return;
    try {
      loadingModels = true;
      availableModels = await getAIEngineModels(selectedEngine.engine_key);
    } catch (err: any) {
      error = err;
      availableModels = null;
    } finally {
      loadingModels = false;
    }
  }

  async function updateEngine(
    engineKey: string,
    data: {
      is_enabled?: boolean;
      api_key?: string;
      whitelisted_models?: string[];
      default_model?: string | null;
      is_default?: boolean;
    },
  ) {
    saving = true;
    try {
      // If setting default engine, update branding settings
      if (data.is_default === true) {
        const branding = await getBranding();
        const engine = engines.find((e) => e.engine_key === engineKey);
        if (!engine) {
          const t = get(_);
          throw new Error(t('aiEngines.toasts.engineNotFound'));
        }

        // Determine the default model to use:
        // 1. Use the model from data if provided (from form)
        // 2. Fall back to engine's current default_model
        // 3. Fall back to first whitelisted model from form data if available
        const defaultModel =
          data.default_model ||
          engine.default_model ||
          (data.whitelisted_models && data.whitelisted_models.length > 0
            ? data.whitelisted_models[0]
            : undefined);

        if (!defaultModel) {
          const t = get(_);
          throw new Error(t('aiEngines.toasts.cannotSetDefaultWithoutModel'));
        }

        // Update branding with new default engine and model
        // Construct the full request body as required by the API
        await updateBranding({
          name: branding.name,
          domain: branding.domain,
          allowed_domains: branding.allowed_domains || [],
          logo_url: branding.logo_url,
          settings: {
            ...branding.settings,
            default_engine: engineKey,
            default_model: defaultModel,
          },
        });
      }

      // Update engine configuration (excluding is_default as it's handled by organization)
      const { is_default, ...engineUpdateData } = data;
      await updateAIEngine(engineKey, engineUpdateData);
      
      // Refresh to sync state
      await fetch();
      if (selectedEngine?.engine_key === engineKey) {
        await refreshSelectedEngine();
      }
    } catch (err: any) {
      error = err;
      throw err;
    } finally {
      saving = false;
    }
  }

  async function addOrUpdateApiKey() {
    if (!selectedEngine) return;
    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      const t = get(_);
      throw new Error(t('aiEngines.apiKey.enterKey'));
    }

    apiKeyLoading = true;
    try {
      await updateAIEngine(selectedEngine.engine_key, {
        api_key: trimmedKey,
      });
      apiKeyStatus = 'not_validated';
      apiKeyMessage = getStatusMessage('not_validated');
      apiKeyMode = 'view';
      await refreshSelectedEngine();
      apiKeyInput = '';
    } catch (err: any) {
      const t = get(_);
      apiKeyStatus = 'in_valid';
      apiKeyMessage =
        err?.message ||
        t('aiEngines.apiKey.invalidDetailed');
      throw err;
    } finally {
      apiKeyLoading = false;
    }
  }

  async function validateApiKey() {
    if (!selectedEngine) {
      const t = get(_);
      throw new Error(t('aiEngines.toasts.noEngineSelected'));
    }
    apiKeyLoading = true;
    try {
      const result = await validateAIEngineKey(selectedEngine.engine_key);
      const t = get(_);
      apiKeyStatus = result.valid ? 'valid' : 'in_valid';
      apiKeyMessage =
        result.message ||
        (result.valid
          ? t('aiEngines.apiKey.valid')
          : t('aiEngines.apiKey.invalidDetailed'));
      await refreshSelectedEngine();
      return result;
    } catch (err: any) {
      const t = get(_);
      apiKeyStatus = 'in_valid';
      apiKeyMessage =
        err?.message ||
        t('aiEngines.apiKey.invalidDetailed');
      throw err;
    } finally {
      apiKeyLoading = false;
    }
  }

  async function removeApiKey() {
    if (!selectedEngine) return;
    apiKeyLoading = true;
    try {
      await deleteAIEngineKey(selectedEngine.engine_key);
      availableModels = null;
      apiKeyMode = 'cta';
      apiKeyStatus = 'not_configured';
      apiKeyMessage = null;
      apiKeyDeleteConfirm = false;
      await refreshSelectedEngine();
      await loadModelsForSelected();
    } catch (err: any) {
      error = err;
      throw err;
    } finally {
      apiKeyLoading = false;
    }
  }

  function resetApiKeyState() {
    apiKeyInput = '';
    apiKeyMessage = null;
    apiKeyStatus = 'not_configured';
    apiKeyLoading = false;
    showApiKey = false;
    apiKeyDeleteConfirm = false;
  }

  function clearError() {
    error = null;
  }

  function isDefaultEngine(engineKey: string): boolean {
    return defaultEngineKey === engineKey;
  }

  function reset() {
    engines = [];
    isLoading = false;
    error = null;
    defaultEngineKey = undefined;
    showConfigModal = false;
    selectedEngine = null;
    availableModels = null;
    loadingModels = false;
    loadingOrganization = false;
    saving = false;
    resetApiKeyState();
    formData = {
      is_enabled: true,
      whitelisted_models: [],
      default_model: null,
      is_default: false,
    };
  }

  return {
    // State getters
    get engines() {
      return engines;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get showConfigModal() {
      return showConfigModal;
    },
    get selectedEngine() {
      return selectedEngine;
    },
    get availableModels() {
      return availableModels;
    },
    get loadingModels() {
      return loadingModels;
    },
    get loadingOrganization() {
      return loadingOrganization;
    },
    get apiKeyInput() {
      return apiKeyInput;
    },
    get apiKeyStatus() {
      return apiKeyStatus;
    },
    get apiKeyMessage() {
      return apiKeyMessage;
    },
    get apiKeyLoading() {
      return apiKeyLoading;
    },
    get showApiKey() {
      return showApiKey;
    },
    get apiKeyMode() {
      return apiKeyMode;
    },
    get apiKeyDeleteConfirm() {
      return apiKeyDeleteConfirm;
    },
    get formData() {
      return formData;
    },
    get saving() {
      return saving;
    },

    // State setters
    set apiKeyInput(value: string) {
      apiKeyInput = value;
    },
    set apiKeyStatus(value: ApiKeyStatus) {
      apiKeyStatus = value;
      apiKeyMessage = getStatusMessage(value);
    },
    set apiKeyMessage(value: string | null) {
      apiKeyMessage = value;
    },
    set showApiKey(value: boolean) {
      showApiKey = value;
    },
    set apiKeyMode(value: ApiKeyMode) {
      apiKeyMode = value;
    },
    set apiKeyDeleteConfirm(value: boolean) {
      apiKeyDeleteConfirm = value;
    },
    set formData(value: typeof formData) {
      formData = value;
    },

    // Methods
    fetch,
    toggleEngineStatus,
    openConfigModal,
    closeConfigModal,
    refreshSelectedEngine,
    loadModelsForSelected,
    updateEngine,
    addOrUpdateApiKey,
    validateApiKey,
    removeApiKey,
    resetApiKeyState,
    getStatusMessage,
    clearError,
    isDefaultEngine,
    reset,
  };
}

export const aiEnginesStore = createAIEnginesStore();

