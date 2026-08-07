// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';
import type { Branding, UpdateBrandingRequest } from '../../admin/types.js';

export async function getBranding(): Promise<Branding> {
  return request<Branding>('/admin/branding', {
    method: 'GET',
  });
}

export async function updateBranding(data: UpdateBrandingRequest): Promise<Branding> {
  return request<Branding>('/admin/branding', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
