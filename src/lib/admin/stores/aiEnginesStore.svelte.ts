// AI Engines Store - AI engine management state using Svelte 5 runes
import type { AIEngine, AIEngineModels } from '../types.js';
import {
  getAIEngines,
  updateAIEngine,
  validateAIEngineKey,
  getAIEngineModels,
  deleteAIEngineKey,
} from '../../api/admin/AiEngines.js';

type ApiKeyStatus = 'valid' | 'in_valid' | 'not_validated' | 'not_configured';
type ApiKeyMode = 'cta' | 'add' | 'view' | 'update';

function createAIEnginesStore() {
  let engines = $state<AIEngine[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Modal state
  let showConfigModal = $state(false);
  let selectedEngine = $state<AIEngine | null>(null);

  // Models state
  let availableModels = $state<AIEngineModels | null>(null);
  let loadingModels = $state(false);

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

  function getStatusMessage(status: ApiKeyStatus): string {
    if (status === 'valid') return 'Key is valid and connected.';
    if (status === 'in_valid')
      return 'Error: The provided API key is invalid. Please check and try again.';
    if (status === 'not_validated')
      return 'Key is not validated. Validate to enable model access.';
    return 'API key is not configured. Please add an API key.';
  }

  async function fetch() {
    isLoading = true;
    error = null;

    try {
      engines = await getAIEngines();
    } catch (err: any) {
      error = err.message || 'Failed to fetch AI engines';
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
      error = err.message || 'Failed to update engine status';
      throw err;
    }
  }

  async function openConfigModal(engine: AIEngine) {
    selectedEngine = engine;

    formData = {
      is_enabled: engine.is_enabled,
      whitelisted_models: engine.whitelisted_models || [],
      default_model: engine.default_model,
      is_default: engine.is_default || false,
    };

    // Load available models
    try {
      loadingModels = true;
      availableModels = await getAIEngineModels(engine.engine_key);
    } catch (err: any) {
      error = err.message || 'Failed to load models';
      availableModels = null;
    } finally {
      loadingModels = false;
    }

    // Initialize API key state
    apiKeyInput = '';
    apiKeyStatus = engine.api_key_status || 'not_configured';
    apiKeyMessage = getStatusMessage(apiKeyStatus);
    apiKeyMode = engine.api_key_configured ? 'view' : 'cta';
    showApiKey = false;
    apiKeyDeleteConfirm = false;

    showConfigModal = true;
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
      error = err.message || 'Failed to load models';
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
    try {
      await updateAIEngine(engineKey, data);
      await fetch();
      if (selectedEngine?.engine_key === engineKey) {
        await refreshSelectedEngine();
      }
    } catch (err: any) {
      error = err.message || 'Failed to update engine';
      throw err;
    }
  }

  async function addOrUpdateApiKey() {
    if (!selectedEngine) return;
    const trimmedKey = apiKeyInput.trim();
    if (!trimmedKey) {
      throw new Error('Please enter an API key.');
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
      apiKeyStatus = 'in_valid';
      apiKeyMessage =
        err?.message ||
        'Error: The provided API key is invalid. Please check and try again.';
      throw err;
    } finally {
      apiKeyLoading = false;
    }
  }

  async function validateApiKey() {
    if (!selectedEngine) {
      throw new Error('No engine selected');
    }
    apiKeyLoading = true;
    try {
      const result = await validateAIEngineKey(selectedEngine.engine_key);
      apiKeyStatus = result.valid ? 'valid' : 'in_valid';
      apiKeyMessage =
        result.message ||
        (result.valid
          ? 'Key is valid and connected.'
          : 'Error: The provided API key is invalid. Please check and try again.');
      await refreshSelectedEngine();
      return result;
    } catch (err: any) {
      apiKeyStatus = 'in_valid';
      apiKeyMessage =
        err?.message ||
        'Error: The provided API key is invalid. Please check and try again.';
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
      error = err?.message || 'Failed to delete API key';
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

  function reset() {
    engines = [];
    isLoading = false;
    error = null;
    showConfigModal = false;
    selectedEngine = null;
    availableModels = null;
    loadingModels = false;
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
    reset,
  };
}

export const aiEnginesStore = createAIEnginesStore();

