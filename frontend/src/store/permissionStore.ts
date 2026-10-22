import { create } from 'zustand';
import api from '../lib/api';

export interface ModulePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface PermissionState {
  roleKey: string;
  roleName: string;
  isOrgAdmin: boolean;
  permissions: Record<string, ModulePermission>;
  isLoading: boolean;
  fetchPermissions: (workspaceId: string) => Promise<void>;
  canView: (module: string) => boolean;
  canCreate: (module: string) => boolean;
  canEdit: (module: string) => boolean;
  canDelete: (module: string) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  roleKey: 'MEMBER',
  roleName: 'Member',
  isOrgAdmin: false,
  permissions: {},
  isLoading: false,

  fetchPermissions: async (workspaceId: string) => {
    if (!workspaceId) return;
    set({ isLoading: true });
    try {
      const res = await api.get(`/auth/admin/my-permissions?workspaceId=${workspaceId}`);
      if (res.data?.success && res.data?.data) {
        const { roleKey, roleName, isOrgAdmin, permissions } = res.data.data;
        set({
          roleKey,
          roleName,
          isOrgAdmin: Boolean(isOrgAdmin),
          permissions: permissions || {},
          isLoading: false
        });
      }
    } catch (err) {
      console.error('Failed to fetch user role permissions:', err);
      set({ isLoading: false });
    }
  },

  canView: (module: string) => {
    const { isOrgAdmin, permissions } = get();
    if (isOrgAdmin) return true;
    return Boolean(permissions[module]?.view);
  },

  canCreate: (module: string) => {
    const { isOrgAdmin, permissions } = get();
    if (isOrgAdmin) return true;
    return Boolean(permissions[module]?.create);
  },

  canEdit: (module: string) => {
    const { isOrgAdmin, permissions } = get();
    if (isOrgAdmin) return true;
    return Boolean(permissions[module]?.edit);
  },

  canDelete: (module: string) => {
    const { isOrgAdmin, permissions } = get();
    if (isOrgAdmin) return true;
    return Boolean(permissions[module]?.delete);
  }
}));
