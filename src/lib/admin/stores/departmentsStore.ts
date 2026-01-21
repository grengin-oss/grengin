import { writable, derived } from 'svelte/store';
import type { Department } from '../types.js';
import * as departmentsApi from '../../api/admin/departments.js';

interface DepartmentsState {
  departments: Department[];
  selectedDepartment: Department | null;
  loading: boolean;
  error: Error | null;
  total: number;
}

function createDepartmentsStore() {
  const { subscribe, set, update } = writable<DepartmentsState>({
    departments: [],
    selectedDepartment: null,
    loading: false,
    error: null,
    total: 0,
  });

  return {
    subscribe,
    
    async fetchDepartments() {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const response = await departmentsApi.getDepartments();
        update(state => ({
          ...state,
          departments: response.departments,
          total: response.total,
          loading: false,
        }));
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
      }
    },

    async fetchDepartment(departmentId: string) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const department = await departmentsApi.getDepartment(departmentId);
        update(state => ({
          ...state,
          selectedDepartment: department,
          loading: false,
        }));
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
      }
    },

    async createDepartment(data: { name: string; description: string; parent_id?: string | null; leader_ids?: string[] }) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const newDepartment = await departmentsApi.createDepartment(data);
        const response = await departmentsApi.getDepartments();
        update(state => ({
          ...state,
          departments: response.departments,
          total: response.total,
          loading: false,
        }));
        return newDepartment;
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
        throw error;
      }
    },

    async updateDepartment(departmentId: string, data: { name?: string; description?: string; parent_id?: string | null; leader_ids?: string[] }) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const updatedDepartment = await departmentsApi.updateDepartment(departmentId, data);
        const response = await departmentsApi.getDepartments();
        update(state => ({
          ...state,
          departments: response.departments,
          total: response.total,
          selectedDepartment: state.selectedDepartment?.id === departmentId 
            ? updatedDepartment 
            : state.selectedDepartment,
          loading: false,
        }));
        return updatedDepartment;
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
        throw error;
      }
    },

    async deleteDepartment(departmentId: string) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        await departmentsApi.deleteDepartment(departmentId);
        const response = await departmentsApi.getDepartments();
        update(state => ({
          ...state,
          departments: response.departments,
          total: response.total,
          selectedDepartment: state.selectedDepartment?.id === departmentId 
            ? null 
            : state.selectedDepartment,
          loading: false,
        }));
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
        throw error;
      }
    },

    async moveDepartment(departmentId: string, newParentId: string | null) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const movedDepartment = await departmentsApi.moveDepartment(departmentId, newParentId);
        const response = await departmentsApi.getDepartments();
        update(state => ({
          ...state,
          departments: response.departments,
          total: response.total,
          selectedDepartment: state.selectedDepartment?.id === departmentId 
            ? movedDepartment 
            : state.selectedDepartment,
          loading: false,
        }));
        return movedDepartment;
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
        throw error;
      }
    },

    async setBudget(departmentId: string, amount: number, period: string) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const updatedDepartment = await departmentsApi.setBudget(departmentId, { amount, period: period as any });
        const response = await departmentsApi.getDepartments();
        update(state => ({
          ...state,
          departments: response.departments,
          total: response.total,
          selectedDepartment: state.selectedDepartment?.id === departmentId 
            ? updatedDepartment 
            : state.selectedDepartment,
          loading: false,
        }));
        return updatedDepartment;
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
          loading: false,
        }));
        throw error;
      }
    },

    selectDepartment(department: Department | null) {
      update(state => ({ ...state, selectedDepartment: department }));
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    reset() {
      set({
        departments: [],
        selectedDepartment: null,
        loading: false,
        error: null,
        total: 0,
      });
    },
  };
}

export const departmentsStore = createDepartmentsStore();

export const departmentTree = derived(
  departmentsStore,
  $store => {
    const buildTree = (parentId: string | null = null): Department[] => {
      return $store.departments
        .filter(dept => dept.parent_id === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
    };
    
    return buildTree();
  }
);
