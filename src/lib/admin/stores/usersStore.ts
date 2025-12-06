// Users Store - User management state
import { writable } from 'svelte/store';
import type { User, PaginatedUsers } from '../types';
import { getUsers, createUser, updateUser, deactivateUser } from '../api';

interface UsersState {
  users: User[];
  total: number;
  limit: number;
  offset: number;
  isLoading: boolean;
  error: string | null;
  filters: {
    search: string;
    role: string;
    status: string;
    department: string;
  };
}

const initialState: UsersState = {
  users: [],
  total: 0,
  limit: 20,
  offset: 0,
  isLoading: false,
  error: null,
  filters: {
    search: '',
    role: '',
    status: '',
    department: '',
  },
};

function createUsersStore() {
  const { subscribe, set, update } = writable<UsersState>(initialState);

  return {
    subscribe,

    async fetch() {
      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        const state = await new Promise<UsersState>(resolve => {
          subscribe(s => resolve(s))();
        });

        const data = await getUsers({
          limit: state.limit,
          offset: state.offset,
          search: state.filters.search || undefined,
          role: state.filters.role || undefined,
          status: state.filters.status || undefined,
          department: state.filters.department || undefined,
        });

        update(s => ({
          ...s,
          users: data.users,
          total: data.total,
          isLoading: false,
        }));
      } catch (err: any) {
        update(s => ({
          ...s,
          isLoading: false,
          error: err.message || 'Failed to fetch users',
        }));
      }
    },

    setFilters(filters: Partial<UsersState['filters']>) {
      update(s => ({
        ...s,
        filters: { ...s.filters, ...filters },
        offset: 0, // Reset to first page when filters change
      }));
      return this.fetch();
    },

    setPage(page: number) {
      update(s => ({ ...s, offset: page * s.limit }));
      return this.fetch();
    },

    async create(userData: Parameters<typeof createUser>[0]) {
      try {
        await createUser(userData);
        return this.fetch(); // Refresh list
      } catch (err: any) {
        update(s => ({ ...s, error: err.message || 'Failed to create user' }));
        throw err;
      }
    },

    async update(userId: string, updates: Parameters<typeof updateUser>[1]) {
      try {
        await updateUser(userId, updates);
        return this.fetch(); // Refresh list
      } catch (err: any) {
        update(s => ({ ...s, error: err.message || 'Failed to update user' }));
        throw err;
      }
    },

    async deactivate(userId: string) {
      try {
        await deactivateUser(userId);
        return this.fetch(); // Refresh list
      } catch (err: any) {
        update(s => ({ ...s, error: err.message || 'Failed to deactivate user' }));
        throw err;
      }
    },

    clearError() {
      update(s => ({ ...s, error: null }));
    },

    reset() {
      set(initialState);
    },
  };
}

export const usersStore = createUsersStore();

