// Admin API Client
// Handles all API calls to the backend admin endpoints
// TODO: Wire up real authentication tokens and CSRF protection

const API_BASE = 'http://localhost:3000';

// Helper to get auth headers
// TODO: Replace with actual auth token from your auth system
function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    // TODO: Add auth token header here
    'Authorization': `Bearer DemoToken`,
    // TODO: Add CSRF token if required
    // 'X-CSRF-Token': getCsrfToken(),
  };
}

// Generic API error handling
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public detail?: string
  ) {
    super(detail || statusText);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      response.statusText,
      errorData.detail || errorData.message
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Generic GET request
async function get<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return handleResponse<T>(response);
}

// Generic POST request
async function post<T>(endpoint: string, data?: any): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  });
  return handleResponse<T>(response);
}

// Generic PUT request
async function put<T>(endpoint: string, data: any): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<T>(response);
}

// Generic DELETE request
async function del<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse<T>(response);
}

export const apiClient = {
  get,
  post,
  put,
  delete: del,
};

