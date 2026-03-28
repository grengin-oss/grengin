import { writable } from 'svelte/store';
import type { Department, SetBudgetRequest } from '../types.js';
import * as departmentsApi from '../../api/admin/departments.js';

interface DepartmentsState {
  departmentsTree: Department[];
  administeredDepartments: Department[];
  selectedDepartment: Department | null;
  loading: boolean;
  error: Error | null;
  total: number;
}

function createDepartmentsStore() {
  const { subscribe, set, update } = writable<DepartmentsState>({
    administeredDepartments: [],
    departmentsTree: [],
    selectedDepartment: null,
    loading: false,
    error: null,
    total: 0,
  });

  return {
    subscribe,

    async fetchAdministeredDepartments() {
      update(state => ({ ...state, error: null }));
      try {
        const response = await departmentsApi.getAdministeredDepartments();

        update(state => ({
          ...state,
          administeredDepartments: response.departments
        }));        
      } catch (error) {
        update(state => ({
          ...state,
          error: error as Error,
        }));
      }
    },

    async fetchDepartmentsTree() {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const response = await departmentsApi.getDepartmentsTree();
        update(state => ({
          ...state,
          departmentsTree: response.tree,
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
        const [flatResponse, treeResponse] = await Promise.all([
          departmentsApi.getDepartments(),
          departmentsApi.getDepartmentsTree(),
        ]);
        update(state => ({
          ...state,
          administeredDepartments: flatResponse.departments,
          departmentsTree: treeResponse.tree,
          total: flatResponse.total,
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

    async updateDepartment(departmentId: string, data: { name?: string; description?: string; parent_id?: string | null; admin_ids?: string[] }) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const updatedDepartment = await departmentsApi.updateDepartment(departmentId, data);
        const [flatResponse, treeResponse] = await Promise.all([
          departmentsApi.getDepartments(),
          departmentsApi.getDepartmentsTree(),
        ]);
        update(state => ({
          ...state,
          administeredDepartments: flatResponse.departments,
          departmentsTree: treeResponse.tree,
          total: flatResponse.total,
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
        const [flatResponse, treeResponse] = await Promise.all([
          departmentsApi.getDepartments(),
          departmentsApi.getDepartmentsTree(),
        ]);
        update(state => ({
          ...state,
          administeredDepartments: flatResponse.departments,
          departmentsTree: treeResponse.tree,
          total: flatResponse.total,
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
        const [flatResponse, treeResponse] = await Promise.all([
          departmentsApi.getDepartments(),
          departmentsApi.getDepartmentsTree(),
        ]);
        update(state => ({
          ...state,
          administeredDepartments: flatResponse.departments,
          departmentsTree: treeResponse.tree,
          total: flatResponse.total,
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

    async setBudget(departmentId: string, data: SetBudgetRequest) {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const updatedDepartment = await departmentsApi.setBudget(departmentId, data);
        const [flatResponse, treeResponse] = await Promise.all([
          departmentsApi.getDepartments(),
          departmentsApi.getDepartmentsTree(),
        ]);
        update(state => ({
          ...state,
          administeredDepartments: flatResponse.departments,
          departmentsTree: treeResponse.tree,
          total: flatResponse.total,
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
        administeredDepartments: [],
        departmentsTree: [],
        selectedDepartment: null,
        loading: false,
        error: null,
        total: 0,
      });
    },
  };
}

export const departmentsStore = createDepartmentsStore();

