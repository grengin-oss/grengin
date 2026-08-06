// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';

export interface PromptMetric {
  prompt_id: string;
  role_id: string;
  name: string;
  usage_count: number;
  feedback_count: number;
  average_rating: number;
}

export interface PromptMetricsParams {
  prompt_id?: string;
  role_id?: string;
}

export async function getPromptMetrics(params?: PromptMetricsParams): Promise<PromptMetric[]> {
  const searchParams = new URLSearchParams();
  if (params?.prompt_id) searchParams.set('prompt_id', params.prompt_id);
  if (params?.role_id) searchParams.set('role_id', params.role_id);
  const query = searchParams.toString();
  return request<PromptMetric[]>(`/admin/prompt-metrics${query ? `?${query}` : ''}`);
}
