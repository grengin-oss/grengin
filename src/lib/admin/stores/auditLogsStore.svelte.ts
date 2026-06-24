// Audit Logs Store - Audit log state using Svelte 5 runes
import type { AuditLog } from '../types.js';
import { getAuditLogs, getAuditActions } from '../../api/admin/auditLogs.js';
import type { GetAuditLogsParams } from '../../api/admin/auditLogs.js';

interface AuditLogsFilters {
  userId: string;
  action: string;
  startDate: string;
  endDate: string;
}

function createAuditLogsStore() {
  let items = $state<AuditLog[]>([]);
  let total = $state(0);
  let limit = $state(20);
  let page = $state(1);
  let isLoading = $state(false);
  let error = $state<any | null>(null);
  let actionTypes = $state<string[]>([]);
  let actionTypesError = $state<any | null>(null);
  let filters = $state<AuditLogsFilters>({
    userId: '',
    action: '',
    startDate: '',
    endDate: '',
  });

  async function fetch() {
    const params: GetAuditLogsParams = {
      limit,
      page,
    };

    if (filters.userId) params.userId = filters.userId;
    if (filters.action) params.action = filters.action;
    if (filters.startDate) params.startDate = filters.startDate;
    if (filters.endDate) params.endDate = filters.endDate;

    const data = await getAuditLogs(params);
    items = data.items;
    total = data.total;
  }

  async function fetchActionTypes() {
    try {
      actionTypesError = null;
      const actions = await getAuditActions();
      actionTypes = actions;
    } catch (err) {
      console.error('Failed to fetch audit actions:', err);
      actionTypesError = err;
      // Fallback to empty array if API fails
      actionTypes = [];
    }
  }

  async function fetchLogs() {
    isLoading = true;
    error = null;
    try {
      await fetch();
    } catch (err) {
      error = err;
    } finally {
      isLoading = false;
    }
  }

  async function updateInBackground() {
    try {
      await fetch();
    } catch (err: any) {
      error = err;
    }
  }

  return {
    get items() { return items; },
    get total() { return total; },
    get limit() { return limit; },
    get page() { return page; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get actionTypes() { return actionTypes; },
    get actionTypesError() { return actionTypesError; },
    get filters() { return filters; },

    fetchLogs,
    fetchActionTypes,

    async setFilters(newFilters: Partial<AuditLogsFilters>) {
      Object.assign(filters, newFilters);
      page = 1; // Reset to first page when filters change
      return fetchLogs();
    },

    async setPage(newPage: number) {
      page = newPage;
      return fetchLogs();
    },

    getFilterParams(): GetAuditLogsParams {
      const params: GetAuditLogsParams = {};
      if (filters.userId) params.userId = filters.userId;
      if (filters.action) params.action = filters.action;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      return params;
    },

    clearError() {
      error = null;
    },

    clearActionTypesError() {
      actionTypesError = null;
    },

    reset() {
      items = [];
      total = 0;
      limit = 20;
      page = 1;
      isLoading = false;
      error = null;
      actionTypesError = null;
      filters = {
        userId: '',
        action: '',
        startDate: '',
        endDate: '',
      };
    },
  };
}

export const auditLogsStore = createAuditLogsStore();
