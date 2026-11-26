// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
import type { UploadedFile } from './chatApi';

/** Every generation must use the explicit model/provider pair selected by the UI. */
export interface ChatStreamInput {
  message: string;
  provider: string;
  modelName: string;
  uploadedFiles?: UploadedFile[];
  webSearch?: boolean;
  selectedMcpServers?: string[];
}

export function requireChatProvider(provider: string): string {
  if (!provider?.trim()) throw new Error('Select an available provider before continuing.');
  return provider;
}

/** Shared by send, edit and regenerate; never invent a provider or model. */
export function buildChatInput(input: ChatStreamInput) {
  const provider = requireChatProvider(input.provider);
  if (!input.modelName?.trim()) throw new Error('Select an available model before sending a message.');
  return {
    provider,
    model_name: input.modelName,
    config: {},
    web_search: input.webSearch || false,
    selected_tools: [] as string[],
    selected_mcp_servers: input.selectedMcpServers || [],
    messages: [{ role: 'user', content: input.message, files: input.uploadedFiles || [] }],
  };
}
