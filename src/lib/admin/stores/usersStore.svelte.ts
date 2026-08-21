// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

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

/**
 * Upper bound for the client-side unassigned-users derivation.
 *
 * The users API has no "no department" filter (see ENGG-388 open question 2),
 * so the Organization page derives the unassigned population by fetching a
 * single large page and filtering client-side. If an installation ever exceeds
 * this, a dedicated count/list endpoint should replace this derivation.
 */
const UNASSIGNED_FETCH_LIMIT = 1000;

function createUsersStore() {
  let users = $state<User[]>([]);
  let total = $state(0);
  let limit = $state(20);
  let offset = $state(0);
  let isLoading = $state(false);
  let error = $state<any | null>(null);
  let unassignedUsers = $state<User[]>([]);
  let isUnassignedLoading = $state(false);
  /** Unfiltered population size, captured by the unassigned scan below. */
  let peopleTotal = $state(0);
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

  /**
   * Loads the users that belong to no department. Uses the same endpoint (and
   * scoping) as the main list so the count matches the population the Users tab
   * shows, then filters client-side (see UNASSIGNED_FETCH_LIMIT).
   */
  async function fetchUnassignedUsers() {
    isUnassignedLoading = true;
    try {
      const params: GetUsersParams = { limit: UNASSIGNED_FETCH_LIMIT, offset: 0 };
      const useScopedEndpoint = permissionsStore.hasScopedUsersView();
      const data = useScopedEndpoint ? await getScopedUsers(params) : await getUsers(params);
      unassignedUsers = data.users.filter((user) => !user.department_id);
      // Same request already carries the unfiltered head-count the Teams KPIs
      // need, so read it here instead of issuing a second list call.
      peopleTotal = data.total;
    } catch (err: any) {
      error = err;
    } finally {
      isUnassignedLoading = false;
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
    get unassignedUsers() { return unassignedUsers; },
    get unassignedCount() { return unassignedUsers.length; },
    get peopleTotal() { return peopleTotal; },
    get isUnassignedLoading() { return isUnassignedLoading; },

    fetchUsers,
    fetchUnassignedUsers,

    /**
     * Loads every user matching the *current* filters (not just the visible
     * page) so the Users tab can export them. Bounded by the same cap as the
     * unassigned scan.
     */
    async fetchAllFiltered(): Promise<User[]> {
      const params: GetUsersParams = { limit: UNASSIGNED_FETCH_LIMIT, offset: 0 };
      if (filters.search) params.search = filters.search;
      if (filters.role_id) params.role_id = filters.role_id;
      if (filters.status) params.status = filters.status;
      if (filters.department) params.department = filters.department;
      params.sort = sort ?? 'created_at';
      params.ascending = sort ? ascending : false;

      const useScopedEndpoint = permissionsStore.hasScopedUsersView();
      const data = useScopedEndpoint ? await getScopedUsers(params) : await getUsers(params);
      return data.users;
    },

    /** Assigns a user to a department (team). */
    async assignDepartment(userId: string, departmentId: string) {
      try {
        await updateUser(userId, { department_id: departmentId });
        await Promise.all([updateUsersInBackground(), fetchUnassignedUsers()]);
      } catch (err: any) {
        error = err;
        throw err;
      }
    },

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
      unassignedUsers = [];
      isUnassignedLoading = false;
      peopleTotal = 0;
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

