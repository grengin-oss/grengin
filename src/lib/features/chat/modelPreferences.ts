// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Persistence + resolution for the chat composer's default model.
//
// A brand-new conversation should open on the model the user last used. When
// that model is no longer offered by the registry (unavailable / deprecated /
// renamed), we fall back to the latest available model instead of a hardcoded
// key that may not exist. The registry never exposes a "latest" flag, so
// "latest available" is defined by registry order: the first selectable text
// model returned by the backend.

import {
  findModel,
  isImageModel,
  isSelectableChatModel,
  type ModelInfo,
  type ProviderInfo,
} from '../../api/models';

const LAST_USED_MODEL_KEY = 'grengin:lastUsedModel';

export interface StoredModelPreference {
  model: string;
  provider: string;
}

/** Remember the user's most recent model choice for future new chats. */
export function persistLastUsedModel(model: string, provider: string): void {
  if (!model) return;
  try {
    localStorage.setItem(
      LAST_USED_MODEL_KEY,
      JSON.stringify({ model, provider } satisfies StoredModelPreference),
    );
  } catch {
    // Storage unavailable (private mode, quota, disabled). Non-fatal — the
    // default simply falls back to the latest available model next time.
  }
}

/** Read the last-used model preference, or null if none/invalid. */
export function readLastUsedModel(): StoredModelPreference | null {
  try {
    const raw = localStorage.getItem(LAST_USED_MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredModelPreference>;
    if (parsed && typeof parsed.model === 'string' && parsed.model.length > 0) {
      return {
        model: parsed.model,
        provider: typeof parsed.provider === 'string' ? parsed.provider : '',
      };
    }
  } catch {
    // Malformed value — ignore and fall back to latest.
  }
  return null;
}

/** The latest available model = first selectable text model in registry order. */
function latestAvailableModel(
  providers: ProviderInfo[],
): { provider: ProviderInfo; model: ModelInfo } | undefined {
  // Prefer a text model — image generation is a deliberate choice, not a default.
  for (const provider of providers) {
    const model = provider.models.find(
      (m) => isSelectableChatModel(m) && !isImageModel(m),
    );
    if (model) return { provider, model };
  }
  // Nothing but image/embedding models — fall back to any selectable model.
  for (const provider of providers) {
    const model = provider.models.find((m) => isSelectableChatModel(m));
    if (model) return { provider, model };
  }
  return undefined;
}

/**
 * Resolve the default model for a new chat: the last-used model when it is still
 * a selectable option, otherwise the latest available model. Returns undefined
 * only when the registry has no selectable models (or hasn't loaded yet).
 */
export function resolveDefaultModel(
  providers: ProviderInfo[],
): { provider: ProviderInfo; model: ModelInfo } | undefined {
  if (!providers || providers.length === 0) return undefined;

  const last = readLastUsedModel();
  if (last) {
    const found = findModel(providers, last.model);
    // Honor the last choice only if it is still offered and selectable
    // (guards against unavailable/deprecated models).
    if (found && isSelectableChatModel(found.model)) return found;
  }

  return latestAvailableModel(providers);
}
