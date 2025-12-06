// Dashboard Store - Dashboard data caching and state
import { writable } from 'svelte/store';
import type { AdminDashboard } from '../types';
import { getDashboard } from '../api';

interface DashboardState {
  data: AdminDashboard | null;
  isLoading: boolean;
  error: string | null;
  lastFetch: number | null;
}

const initialState: DashboardState = {
  data: null,
  isLoading: false,
  error: null,
  lastFetch: null,
};

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

function createDashboardStore() {
  const { subscribe, set, update } = writable<DashboardState>(initialState);

  return {
    subscribe,
    
    async fetch(forceRefresh = false) {
      const state = await new Promise<DashboardState>(resolve => {
        subscribe(s => resolve(s))();
      });

      // Return cached data if still fresh
      if (
        !forceRefresh &&
        state.data &&
        state.lastFetch &&
        Date.now() - state.lastFetch < CACHE_DURATION
      ) {
        return;
      }

      update(s => ({ ...s, isLoading: true, error: null }));

      try {
        const data = await getDashboard();
        set({
          data,
          isLoading: false,
          error: null,
          lastFetch: Date.now(),
        });
      } catch (err: any) {
        update(s => ({
          ...s,
          isLoading: false,
          error: err.message || 'Failed to fetch dashboard data',
        }));
      }
    },

    refresh() {
      return this.fetch(true);
    },

    reset() {
      set(initialState);
    },
  };
}

export const dashboardStore = createDashboardStore();

