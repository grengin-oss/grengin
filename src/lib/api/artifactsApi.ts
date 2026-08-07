// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from './client.js';

/** Full persisted artifact as returned by `GET /artifacts/{id}`. */
export interface ArtifactResponse {
  content: string;
  content_type: string;
  conversation_id: string;
  created_at: string;
  file_id: string;
  id: string;
  message_id: string;
  title: string;
  updated_at: string;
}

/**
 * Fetch a persisted artifact's full content by id.
 * This is the source of truth for downloading an artifact — the content comes
 * from the backend, not from whatever is currently held in the UI.
 */
export async function getArtifact(id: string): Promise<ArtifactResponse> {
  return request<ArtifactResponse>(`/artifacts/${id}`);
}
