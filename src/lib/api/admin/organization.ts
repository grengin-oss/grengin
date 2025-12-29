import { request } from '../client.js';
import type { Organization, UpdateOrganizationRequest } from '../../admin/types.js';

export async function getOrganization(): Promise<Organization> {
  return request<Organization>('/admin/organization', {
    method: 'GET',
  });
}

export async function updateOrganization(data: UpdateOrganizationRequest): Promise<Organization> {
  return request<Organization>('/admin/organization', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

