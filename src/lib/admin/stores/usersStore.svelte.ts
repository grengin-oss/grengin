// Users Store - User management state using Svelte 5 runes
import type { User } from '../types.js';
import { getUsers, getScopedUsers, createUser, updateUser, updateUserStatus } from '../../api/admin/users.js';
import type { CreateUserData, GetUsersParams } from '../../api/admin/users.js';
import { permissionsStore } from '../../features/auth/index.js';

interface UsersFilters {
  search: string;
  role_id: string;
  status: string;
  department: string;
}

type SortField = 'name' | 'email' | 'created_at' | null;

function createUsersStore() {
  let users = $state<User[]>([]);
  let total = $state(0);
  let limit = $state(20);
  let offset = $state(0);
  let isLoading = $state(false);
  let error = $state<any | null>(null);
  let filters = $state<UsersFilters>({
    search: '',
    role_id: '',
    status: '',
    department: '',
  });
  let sort = $state<SortField>(null);
  let ascending = $state(true);

  async function fetch() {
    const params: GetUsersParams = {
      limit,
      offset,
    };

    if (filters.search) params.search = filters.search;
    if (filters.role_id) params.role_id = filters.role_id;
    if (filters.status) params.status = filters.status;
    if (filters.department) params.department = filters.department;
    
    // If user has explicitly selected a sort, use it; otherwise default to created_at descending
    if (sort) {
      params.sort = sort;
      params.ascending = ascending;
    } else {
      // Default sort: created_at descending (not visible in UI)
      params.sort = 'created_at';
      params.ascending = false;
    }

    const useScopedEndpoint = permissionsStore.hasScopedUsersView();
    const data = useScopedEndpoint ? await getScopedUsers(params) : await getUsers(params);
    users = data.users;
    total = data.total;
  }

  async function fetchUsers() {
    isLoading = true;
    error = null;

    try {
      await fetch();
    } catch (err: any) {
      error = err;
    } finally {
      isLoading = false;
    }
  }

  async function updateUsersInBackground() {
    try {
      await fetch();
    } catch (err: any) {
      error = err;
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
    get sort() { return sort; },
    get ascending() { return ascending; },

    fetchUsers,

    async setFilters(newFilters: Partial<UsersFilters>) {
      filters = { ...filters, ...newFilters };
      offset = 0; // Reset to first page when filters change
      return updateUsersInBackground();
    },

    async setSort(field: SortField) {
      if (sort === field) {
        // Same column clicked - cycle through: ascending -> descending -> remove
        if (ascending) {
          // Currently ascending, switch to descending
          ascending = false;
        } else {
          // Currently descending, remove sort (back to default)
          sort = null;
          ascending = true; // Reset for next time
        }
      } else {
        // Different column clicked - start with ascending
        sort = field;
        ascending = true;
      }
      offset = 0; // Reset to first page when sort changes
      return updateUsersInBackground();
    },

    async setPage(page: number) {
      offset = page * limit;
      return fetchUsers();
    },

    async create(userData: CreateUserData) {
      try {
        const created = await createUser(userData);
        await updateUsersInBackground();
        return created;
      } catch (err: any) {
        error = err;
        throw err;
      }
    },

    async update(userId: string, updates: Partial<User>) {
      try {
        await updateUser(userId, updates);
        return updateUsersInBackground();
      } catch (err: any) {
        error = err;
        throw err;
      }
    },

    async updateStatus(userId: string, status: 'active' | 'deactivated') {
      try {
        await updateUserStatus(userId, status);
        return updateUsersInBackground();
      } catch (err: any) {
        error = err;
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
        role_id: '',
        status: '',
        department: '',
      };
      sort = null;
      ascending = true;
    },
  };
}

export const usersStore = createUsersStore();

