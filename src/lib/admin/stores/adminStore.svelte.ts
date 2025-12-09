// Admin Store - Global admin state management using Svelte 5 runes

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
}

function createAdminStore() {
  let currentPage = $state<AdminPage>('dashboard');
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  return {
    get currentPage() { return currentPage; },
    get isLoading() { return isLoading; },
    get error() { return error; },

    setPage(page: AdminPage) {
      currentPage = page;
      error = null;
    },

    setLoading(loading: boolean) {
      isLoading = loading;
    },

    setError(err: string | null) {
      error = err;
      isLoading = false;
    },

    clearError() {
      error = null;
    },

    reset() {
      currentPage = 'dashboard';
      isLoading = false;
      error = null;
    },
  };
}

export const adminStore = createAdminStore();
