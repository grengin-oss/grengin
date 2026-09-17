// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Provider categories for the "Browse Providers" dialog (ai-engines.html
 * .bp-modal), which groups the engines you have not connected yet under
 * headings and offers the same headings as filter tabs.
 *
 * `GET /admin/ai-engines` carries no category field, so the grouping lives
 * here as a lookup on `engine_key`. Anything the registry adds that is not
 * listed falls into `other`, so a new backend engine still shows up — it just
 * lands in the last group instead of a named one.
 */

export type ProviderCategory =
  | 'major'
  | 'aggregators'
  | 'regional'
  | 'voice'
  | 'image'
  | 'embeddings'
  | 'other';

/** Render order of the groups and of the tab strip. */
export const PROVIDER_CATEGORY_ORDER: ProviderCategory[] = [
  'major',
  'aggregators',
  'regional',
  'voice',
  'image',
  'embeddings',
  'other',
];

const CATEGORY_BY_ENGINE_KEY: Record<string, ProviderCategory> = {
  // Major providers — first-party frontier labs and the hyperscaler gateways.
  openai: 'major',
  anthropic: 'major',
  google: 'major',
  gemini: 'major',
  'google-vertex': 'major',
  vertex: 'major',
  vertexai: 'major',
  azure: 'major',
  'azure-openai': 'major',
  bedrock: 'major',
  'aws-bedrock': 'major',
  watsonx: 'major',
  'ibm-watsonx': 'major',
  meta: 'major',
  xai: 'major',
  grok: 'major',

  // Aggregators — one key, many upstream models.
  openrouter: 'aggregators',
  together: 'aggregators',
  togetherai: 'aggregators',
  fireworks: 'aggregators',
  replicate: 'aggregators',
  anyscale: 'aggregators',
  groq: 'aggregators',
  cerebras: 'aggregators',
  perplexity: 'aggregators',
  deepinfra: 'aggregators',
  novita: 'aggregators',
  hyperbolic: 'aggregators',

  // Regional labs.
  mistral: 'regional',
  'mistral-ai': 'regional',
  deepseek: 'regional',
  qwen: 'regional',
  alibaba: 'regional',
  dashscope: 'regional',
  glm: 'regional',
  zhipu: 'regional',
  kimi: 'regional',
  moonshot: 'regional',
  baichuan: 'regional',
  yi: 'regional',
  'zero-one': 'regional',
  sarvam: 'regional',
  krutrim: 'regional',
  aleph: 'regional',
  'aleph-alpha': 'regional',

  // Voice & audio.
  elevenlabs: 'voice',
  deepgram: 'voice',
  assemblyai: 'voice',
  playht: 'voice',
  cartesia: 'voice',
  whisper: 'voice',
  speechmatics: 'voice',

  // Image & video.
  stability: 'image',
  'stability-ai': 'image',
  midjourney: 'image',
  leonardo: 'image',
  runway: 'image',
  luma: 'image',
  ideogram: 'image',
  'black-forest-labs': 'image',
  flux: 'image',
  recraft: 'image',

  // Embeddings & search.
  cohere: 'embeddings',
  voyage: 'embeddings',
  voyageai: 'embeddings',
  jina: 'embeddings',
  nomic: 'embeddings',
  exa: 'embeddings',
};

/** The group an engine belongs to; `other` for anything unlisted. */
export function providerCategory(engineKey: string): ProviderCategory {
  return CATEGORY_BY_ENGINE_KEY[engineKey.trim().toLowerCase()] ?? 'other';
}
