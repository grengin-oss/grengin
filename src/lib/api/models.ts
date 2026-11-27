// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

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
  /**
   * Whether the model can take more than one image in a single message. Absent
   * on older/gateway responses → treated as "no limit" (today's behaviour); only
   * an explicit `false` caps a message at one image. (grengin-api /models.)
   */
  supports_multiple_images?: boolean;
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
  /**
   * Catalog metadata (grengin-api 0.9.14). `specialty` is always present on a
   * 0.9.14 response (`general` when the catalog names none); the rest are
   * optional and simply hidden when absent. Gateway/plugin copies borrow these
   * from the matching catalog model; `default` applies only to a provider's own
   * engine, never to gateway copies.
   */
  specialty?: string;
  summary?: string;
  price_tier?: string;
  recommended?: boolean;
  default?: boolean;
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

/** A specialty code with its English label (used when the webapp can't translate the code). */
export interface SpecialtyInfo {
  id: string;
  label: string;
  description?: string;
}

/** A price-tier code with its English label. */
export interface PriceTierInfo {
  id: string;
  label: string;
}

/**
 * Attachment limits the chat stream enforces (grengin-api 0.9.14). Read from
 * `GET /models` so the composer validates before sending.
 */
export interface GlobalAttachments {
  /** HTML `accept` tokens; a lone match-anything entry means leave the input unrestricted. */
  accepted_types: string[];
  max_file_size_bytes: number;
  max_files_per_message: number;
}

export interface ModelsResponse {
  providers: ProviderInfo[];
  /** Specialty catalog (codes + English labels) for codes the webapp can't translate. */
  specialties?: SpecialtyInfo[];
  /** Price-tier catalog (codes + English labels). */
  price_tiers?: PriceTierInfo[];
  /** Attachment limits enforced by the chat stream. */
  global_attachments?: GlobalAttachments;
}

/** Fallback attachment limits when the server doesn't send `global_attachments`. */
export const DEFAULT_GLOBAL_ATTACHMENTS: GlobalAttachments = {
  accepted_types: ['*/*'],
  max_file_size_bytes: 26214400, // 25 MiB
  max_files_per_message: 32,
};

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
 * the currently-selected model an image generator?). A supplied provider key
 * scopes the lookup so shared model names cannot switch providers on refresh.
 */
export function findModel(
  providers: ProviderInfo[],
  modelKeyOrName?: string | null,
  providerKey?: string | null,
): { provider: ProviderInfo; model: ModelInfo } | undefined {
  if (!modelKeyOrName) return undefined;
  for (const provider of providers) {
    if (providerKey && provider.key !== providerKey) continue;
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

/** The HTML `accept` value for the file input, or undefined to leave it unrestricted. */
export function attachmentAcceptAttribute(limits: GlobalAttachments): string | undefined {
  const types = limits.accepted_types ?? [];
  if (types.length === 0 || types.some((t) => t === '*/*' || t === '*')) return undefined;
  return types.join(',');
}

/** Why an attachment is rejected, or null when it is acceptable. */
export type AttachmentRejection = 'too_big' | 'unsupported_type';

/**
 * Does a file match one of the HTML `accept` tokens? Tokens may be a MIME type
 * (`image/png`), a subtype wildcard (`image/*`), the match-anything token, or a
 * filename extension (`.pdf`).
 */
export function isAcceptedFileType(
  file: { name: string; type: string },
  acceptedTypes: string[],
): boolean {
  if (!acceptedTypes || acceptedTypes.length === 0) return true;
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return acceptedTypes.some((raw) => {
    const token = raw.trim().toLowerCase();
    if (!token || token === '*/*' || token === '*') return true;
    if (token.startsWith('.')) return name.endsWith(token);
    if (token.endsWith('/*')) return mime.startsWith(token.slice(0, -1)); // e.g. "image/"
    return mime === token;
  });
}

/** Image MIME types the composer recognises as attachable images. */
const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/avif',
];

/** Image filename extensions the composer recognises as attachable images. */
const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.tiff',
  '.tif',
  '.heic',
  '.heif',
  '.avif',
];

/** Does the file look like an image (by MIME type or extension)? */
export function isImageAttachment(file: { name: string; type: string }): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return IMAGE_MIME_TYPES.includes(type) || IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** Does the file look like a PDF (by MIME type or `.pdf` extension)? */
export function isPdfAttachment(file: { name: string; type: string }): boolean {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
}

/**
 * Why the selected model can't accept a file, or null when it can. Only an
 * explicit `false` on the model's capability field blocks the file; absent
 * fields keep today's behaviour (the attachment is allowed). `no_images` covers
 * a model that can't see images at all (`supports_vision: false`); `no_pdf`
 * covers a model that can't read PDFs (`supports_pdf_native: false`). The
 * one-image-per-message cap (`supports_multiple_images: false`) is a count
 * constraint handled separately — see {@link modelAllowsMultipleImages}.
 */
export type ModelAttachmentBlock = 'no_images' | 'no_pdf';

export function modelAttachmentBlock(
  model: ModelInfo | undefined | null,
  file: { name: string; type: string },
): ModelAttachmentBlock | null {
  if (!model) return null;
  if (model.supports_vision === false && isImageAttachment(file)) return 'no_images';
  if (model.supports_pdf_native === false && isPdfAttachment(file)) return 'no_pdf';
  return null;
}

/**
 * Whether the model may hold more than one image in a single message. True
 * unless the model explicitly sets `supports_multiple_images: false`, so models
 * that don't send the field keep today's behaviour.
 */
export function modelAllowsMultipleImages(model: ModelInfo | undefined | null): boolean {
  return !(model != null && model.supports_multiple_images === false);
}

/**
 * Given the files already carried by earlier messages in a conversation, does
 * the model fail to support any of them? Used to warn (a soft toast) when the
 * user switches to a model that can't read images/PDFs already in the thread.
 */
export function modelMissesEarlierFiles(
  model: ModelInfo | undefined | null,
  files: Array<{ name: string; type: string }>,
): boolean {
  if (!model) return false;
  return files.some((file) => modelAttachmentBlock(model, file) !== null);
}

/** Validate one file against the global attachment limits (size + type). */
export function validateAttachment(
  file: { name: string; type: string; size: number },
  limits: GlobalAttachments,
): AttachmentRejection | null {
  if (file.size > limits.max_file_size_bytes) return 'too_big';
  if (!isAcceptedFileType(file, limits.accepted_types)) return 'unsupported_type';
  return null;
}

/** Read `global_attachments` from a models response, falling back to defaults. */
export function resolveGlobalAttachments(res?: Partial<ModelsResponse> | null): GlobalAttachments {
  const g = res?.global_attachments;
  if (!g) return { ...DEFAULT_GLOBAL_ATTACHMENTS };
  return {
    accepted_types:
      Array.isArray(g.accepted_types) && g.accepted_types.length > 0
        ? g.accepted_types
        : DEFAULT_GLOBAL_ATTACHMENTS.accepted_types,
    max_file_size_bytes:
      typeof g.max_file_size_bytes === 'number' && g.max_file_size_bytes > 0
        ? g.max_file_size_bytes
        : DEFAULT_GLOBAL_ATTACHMENTS.max_file_size_bytes,
    max_files_per_message:
      typeof g.max_files_per_message === 'number' && g.max_files_per_message > 0
        ? g.max_files_per_message
        : DEFAULT_GLOBAL_ATTACHMENTS.max_files_per_message,
  };
}

/**
 * The catalog's default model for a provider (0.9.14 `default` flag), or
 * undefined when none is marked. If more than one is marked, the first wins.
 */
export function defaultModelForProvider(provider: ProviderInfo): ModelInfo | undefined {
  return provider.models.find((m) => m.default === true && isSelectableChatModel(m));
}

/**
 * Fetch available models and providers. Pass the UI `locale` (e.g. `ja`,
 * `fr-CA`) so the backend resolves model `summary` strings into that language
 * (grengin-api 0.9.14); summaries fall back fr-CA → fr → en server-side.
 */
export async function getModels(locale?: string): Promise<ModelsResponse> {
  const query = locale && locale.trim() ? `?locale=${encodeURIComponent(locale.trim())}` : '';
  return request<ModelsResponse>(`/models${query}`);
}
