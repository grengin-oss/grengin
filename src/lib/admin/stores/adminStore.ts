// Admin Store - Global admin state management
import { writable } from 'svelte/store';

export type AdminPage = 
  | 'dashboard' 
  | 'users' 
  | 'usage' 
  | 'settings' 
  | 'audit-log'
  | 'settings-sso'
  | 'settings-api-keys'
  | 'settings-rate-limits'
  | 'settings-budgets';

interface AdminState {
  currentPage: AdminPage;
  isLoading: boolean;
  error: string | null;
  // TODO: Get from actual auth context
  currentAdminId: string;
  currentAdminEmail: string;
}

const initialState: AdminState = {
  currentPage: 'dashboard',
  isLoading: false,
  error: null,
  currentAdminId: 'admin-user-id', // TODO: Get from auth
  currentAdminEmail: 'admin@example.com', // TODO: Get from auth
};

function createAdminStore() {
  const { subscribe, set, update } = writable<AdminState>(initialState);

  return {
    subscribe,
    setPage: (page: AdminPage) => update(state => ({ ...state, currentPage: page, error: null })),
    setLoading: (isLoading: boolean) => update(state => ({ ...state, isLoading })),
    setError: (error: string | null) => update(state => ({ ...state, error, isLoading: false })),
    clearError: () => update(state => ({ ...state, error: null })),
    reset: () => set(initialState),
  };
}

export const adminStore = createAdminStore();

