// Dashboard Store - Dashboard data caching and state using Svelte 5 runes
import type { AdminDashboard } from '../types.js';
import { getDashboard } from '../../api/adminDashboard.js';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

function createDashboardStore() {
  let data = $state<AdminDashboard | null>(null);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let lastFetch = $state<number | null>(null);

  return {
    get data() { return data; },
    get isLoading() { return isLoading; },
    get error() { return error; },
    get lastFetch() { return lastFetch; },

    async fetch(forceRefresh = false) {
      // Return cached data if still fresh
      if (
        !forceRefresh &&
        data &&
        lastFetch &&
        Date.now() - lastFetch < CACHE_DURATION
      ) {
        return;
      }

      isLoading = true;
      error = null;

      try {
        const result = await getDashboard();
        data = result;
        lastFetch = Date.now();
      } catch (err: any) {
        error = err.message || 'Failed to fetch dashboard data';
      } finally {
        isLoading = false;
      }
    },

    refresh() {
      return this.fetch(true);
    },

    reset() {
      data = null;
      isLoading = false;
      error = null;
      lastFetch = null;
    },
  };
}

export const dashboardStore = createDashboardStore();
