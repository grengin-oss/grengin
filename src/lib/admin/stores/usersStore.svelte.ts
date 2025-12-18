// Users Store - User management state using Svelte 5 runes
import type { User } from '../types.js';
import { getUsers, createUser, updateUser, updateUserStatus } from '../../api/adminUsers.js';
import type { CreateUserData, GetUsersParams } from '../../api/adminUsers.js';

interface UsersFilters {
  search: string;
  role: string;
  status: string;
  department: string;
}

function createUsersStore() {
  let users = $state<User[]>([]);
  let total = $state(0);
  let limit = $state(20);
  let offset = $state(0);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let filters = $state<UsersFilters>({
    search: '',
    role: '',
    status: 'active',
    department: '',
  });

  async function fetch() {
    isLoading = true;
    error = null;

    try {
      const params: GetUsersParams = {
        limit,
        offset,
      };

      if (filters.search) params.search = filters.search;
      if (filters.role) params.role = filters.role;
      if (filters.status) params.status = filters.status;
      if (filters.department) params.department = filters.department;
      params.sort = 'name'; // Default sort by name

      const data = await getUsers(params);
      users = data.users;
      total = data.total;
    } catch (err: any) {
      error = err.message || 'Failed to fetch users';
    } finally {
      isLoading = false;
    }
  }

  return {
    get users() { return users; },
    get total() { return total; },
    get limit() { return limit; },
    get offset() { return offset; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get filters() { return filters; },

    fetch,

    async setFilters(newFilters: Partial<UsersFilters>) {
      filters = { ...filters, ...newFilters };
      offset = 0; // Reset to first page when filters change
      return fetch();
    },

    async setPage(page: number) {
      offset = page * limit;
      return fetch();
    },

    async create(userData: CreateUserData) {
      try {
        await createUser(userData);
        return fetch();
      } catch (err: any) {
        error = err.message || 'Failed to create user';
        throw err;
      }
    },

    async update(userId: string, updates: Partial<User>) {
      try {
        await updateUser(userId, updates);
        return fetch();
      } catch (err: any) {
        error = err.message || 'Failed to update user';
        throw err;
      }
    },

    async updateStatus(userId: string, status: 'active' | 'deactivated') {
      try {
        await updateUserStatus(userId, status);
        return fetch();
      } catch (err: any) {
        error = err.message || 'Failed to update user status';
        throw err;
      }
    },

    clearError() {
      error = null;
    },

    reset() {
      users = [];
      total = 0;
      limit = 20;
      offset = 0;
      isLoading = false;
      error = null;
      filters = {
        search: '',
        role: '',
        status: 'active',
        department: '',
      };
    },
  };
}

export const usersStore = createUsersStore();

