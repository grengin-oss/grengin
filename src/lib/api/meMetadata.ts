// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from './client.js';

/** Server-side record of the first-launch guided tour (ENGG-447). */
export interface TourGuideMetadata {
  /** True while the user is on their first login. */
  firstLogin?: boolean;
  firstLoginAt?: string | null;
  /** Tour progress; see `onboardingState.svelte.ts` for what each value means. */
  guidePageCount?: number;
}

export interface MetadataResponse {
  metadata: {
    tourGuide?: TourGuideMetadata;
    [key: string]: unknown;
  };
}

export async function getMyMetadata(): Promise<MetadataResponse> {
  return request<MetadataResponse>('/me/metadata');
}

export async function updateGuidePageCount(guidePageCount: number): Promise<MetadataResponse> {
  return request<MetadataResponse>('/me/metadata', {
    method: 'PUT',
    body: JSON.stringify({ guide_page_count: guidePageCount }),
  });
}
