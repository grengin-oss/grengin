import { request } from './client';

/**
 * The kind of model returned by the registry. Loaded automatically from the
 * backend model registry — the frontend never hardcodes which models exist.
 * - `text_generator`  — regular chat/completion models
 * - `image_generator` — image generation / editing models (e.g. gpt-image-2)
 * - `text_embedder`   — embedding models (not selectable in chat)
 */
export type ModelType = 'text_generator' | 'image_generator' | 'text_embedder';

export interface ModelInfo {
  key: string;
  name: string;
  /** Registry model type. Absent on legacy responses → treated as text. */
  model_type?: ModelType;
  engine?: string;
  comment?: string | null;
  context_window?: number;
  max_output_tokens?: number;
  supports_streaming?: boolean;
  supports_tools?: boolean;
  supports_vision?: boolean;
  supports_pdf_native?: boolean;
  supports_web_search?: boolean;
  /** Max images an image model may return per request. A model property, not a user control. */
  max_images?: number | null;
  /** Per-image price for image models (server-side accounting; informational on FE). */
  price_per_image?: number | null;
  pricing?: {
    input: number;
    output: number;
  };
  versions?: ModelInfo[];
}

export interface ProviderInfo {
  key: string;
  name: string;
  icon: string;
  icon_dark?: string;
  status?: string;
  models: ModelInfo[];
}

export interface ModelsResponse {
  providers: ProviderInfo[];
}

/** True when the model generates images through the chat stream. */
export function isImageModel(model?: ModelInfo | null): boolean {
  return model?.model_type === 'image_generator';
}

/** Embedding models are never selectable in the chat composer. */
export function isSelectableChatModel(model?: ModelInfo | null): boolean {
  return !!model && model.model_type !== 'text_embedder';
}

/**
 * Look up a model across all providers by its key (or display name), returning
 * the model together with its provider. Used to resolve capabilities (e.g. is
 * the currently-selected model an image generator?) from just a model key.
 */
export function findModel(
  providers: ProviderInfo[],
  modelKeyOrName?: string | null,
): { provider: ProviderInfo; model: ModelInfo } | undefined {
  if (!modelKeyOrName) return undefined;
  for (const provider of providers) {
    const model = provider.models.find(
      (m) => m.key === modelKeyOrName || m.name === modelKeyOrName,
    );
    if (model) return { provider, model };
  }
  return undefined;
}

// Speech Recognition API types
export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart: () => void;
}

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

/**
 * Fetch available models and providers
 */
export async function getModels(): Promise<ModelsResponse> {
  return request<ModelsResponse>('/models');
}
