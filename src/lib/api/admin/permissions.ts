// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { request } from '../client.js';

export interface Permission {
  id: string;
  domain: string;
  action: string;
  is_scopeable: boolean;
  description_key?: string;
}

export interface PermissionsResponse {
  permissions: Permission[];
}

export async function getPermissions(): Promise<PermissionsResponse> {
  return request<PermissionsResponse>('/admin/permissions');
}
