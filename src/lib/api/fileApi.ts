import { API_BASE, request, ApiError, apiFetch } from './client';
import { getAccessToken } from '../features/auth';

/**
 * Get file metadata by ID
 */
export async function getFileMetadata(fileId: string) {
  return request(`/files/${fileId}`);
}

/**
 * Download file binary and return blob URL
 */
export async function downloadFile(fileId: string): Promise<string | null> {
  try {
    const token = getAccessToken();
    if (!token) {
      throw new ApiError(401, {
        type: 'rich',
        code: 401,
        description: 'No authentication token available',
        solution: 'Please log in to continue',
        description_key: 'error.auth.no_token.description',
        solution_key: 'error.auth.no_token.solution',
        params: {},
        external_code: null,
      });
    }

    const downloadUrl = `${API_BASE}/files/${fileId}/download`;
    
    const response = await apiFetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': '*/*'
      },
    });

    if (response.ok) {
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      return blobUrl;
    }
    
    return null;
  } catch (err) {
    console.error('Failed to download file:', err);
    return null;
  }
}
