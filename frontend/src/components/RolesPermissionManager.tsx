'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { usePermissionStore } from '../store/permissionStore';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  Save,
  Users,
  Search,
  Filter,
  LayoutDashboard,
  FolderKanban,
  Kanban,
  ListFilter,
  BarChart2,
  FileText,
  FileCheck2,
  Inbox,
  Lock,
  SlidersHorizontal,
  Clock,
  User,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  Info,
  Eye,
  RotateCcw,
  ArrowLeft
} from 'lucide-react';

interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  availableActions: string[];
}

interface AssignedMember {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  joinedAt?: string;
}

interface RoleItem {
  _id: string;
  name: string;
  key: string;
  description: string;
  isSystemRole: boolean;
  memberCount: number;
  usedBy?: AssignedMember[];
  createdBy?: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  updatedBy?: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  level?: number;
  permissions?: any[];
}

const getLevelBadge = (level: number = 4) => {
  switch (level) {
    case 1:
      return {
        label: 'Level 1 · Org Admin',
        desc: 'Executive Governance',
        color: 'bg-purple-50 text-purple-700 border-purple-200'
      };
    case 2:
      return {
        label: 'Level 2 · Project Manager',
        desc: 'Project & Team Management',
        color: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    case 3:
      return {
        label: 'Level 3 · Team Lead',
        desc: 'Team Operational Oversight',
        color: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    case 5:
      return {
        label: 'Level 5 · Viewer / Guest',
        desc: 'Read-only Stakeholder',
        color: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    case 4:
    default:
      return {
        label: 'Level 4 · Member',
        desc: 'Standard Contributor',
        color: 'bg-slate-100 text-slate-700 border-slate-200'
      };
  }
};

export const RolesPermissionManager: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, currentWorkspace } = useAuthStore();
  const { fetchPermissions } = usePermissionStore();

  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'custom' | 'system'>('all');

  // Drawer / Matrix Modal State
  const [activeMatrixRole, setActiveMatrixRole] = useState<RoleItem | null>(null);
  const [localPermissions, setLocalPermissions] = useState<
    Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>
  >({});
  const [isModified, setIsModified] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  // Create Role Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleKey, setNewRoleKey] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleLevel, setNewRoleLevel] = useState<number>(4);
  const [newRoleTemplate, setNewRoleTemplate] = useState<'admin' | 'pm' | 'lead' | 'member' | 'empty'>('member');
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Role Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleItem | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [editRoleLevel, setEditRoleLevel] = useState<number>(4);

  // Delete Role Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleItem | null>(null);

  // Tooltip Popover for UsedBy list
  const [hoveredRoleMembers, setHoveredRoleMembers] = useState<AssignedMember[] | null>(null);

  // 1. Fetch Configurable Modules
  const { data: modules = [] } = useQuery<ModuleConfig[]>({
    queryKey: ['configurable-modules'],
    queryFn: async () => {
      const res = await api.get('/auth/admin/permissions/modules');
      return res.data?.data || [];
    }
  });

  // 2. Fetch Organization Roles
  const { data: roles = [], isLoading: rolesLoading } = useQuery<RoleItem[]>({
    queryKey: ['workspace-roles', currentWorkspace?._id],
    queryFn: async () => {
      const res = await api.get(`/auth/admin/roles?workspaceId=${currentWorkspace?._id}`);
      return res.data?.data || [];
    },
    enabled: !!currentWorkspace?._id
  });

  // 3. Fetch Selected Role Permissions
  const { data: rolePermissionsData, isLoading: permissionsLoading } = useQuery({
    queryKey: ['role-permissions', activeMatrixRole?._id, currentWorkspace?._id],
    queryFn: async () => {
      if (!activeMatrixRole?._id) return null;
      const res = await api.get(
        `/auth/admin/roles/${activeMatrixRole._id}/permissions?workspaceId=${currentWorkspace?._id}`
      );
      return res.data?.data;
    },
    enabled: !!activeMatrixRole?._id && !!currentWorkspace?._id
  });

  // Sync local permission matrix
  useEffect(() => {
    if (rolePermissionsData?.permissions) {
      const matrix: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }> = {};
      rolePermissionsData.permissions.forEach((p: any) => {
        matrix[p.module] = {
          view: Boolean(p.view),
          create: Boolean(p.create),
          edit: Boolean(p.edit),
          delete: Boolean(p.delete)
        };
      });
      setLocalPermissions(matrix);
      setIsModified(false);
    }
  }, [rolePermissionsData]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeMatrixRole) setActiveMatrixRole(null);
        if (isCreateModalOpen) setIsCreateModalOpen(false);
        if (isEditModalOpen) setIsEditModalOpen(false);
        if (isDeleteModalOpen) setIsDeleteModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMatrixRole, isCreateModalOpen, isEditModalOpen, isDeleteModalOpen]);

  // Handle Checkbox Toggle
  const handleToggle = (moduleId: string, action: 'view' | 'create' | 'edit' | 'delete') => {
    setLocalPermissions((prev) => {
      const current = prev[moduleId] || { view: false, create: false, edit: false, delete: false };
      const updated = { ...current, [action]: !current[action] };

      if (!current[action] && action !== 'view') {
        updated.view = true;
      }
      if (current.view && action === 'view') {
        updated.create = false;
        updated.edit = false;
        updated.delete = false;
      }

      return {
        ...prev,
        [moduleId]: updated
      };
    });
    setIsModified(true);
    setSaveSuccessMsg(false);
  };

  // Quick Action Shortcuts
  const handleGrantAllView = () => {
    setLocalPermissions((prev) => {
      const updated: any = { ...prev };
      modules.forEach((m) => {
        updated[m.id] = {
          ...(updated[m.id] || { create: false, edit: false, delete: false }),
          view: true
        };
      });
      return updated;
    });
    setIsModified(true);
  };

  const handleGrantAll = () => {
    setLocalPermissions(() => {
      const updated: any = {};
      modules.forEach((m) => {
        updated[m.id] = {
          view: true,
          create: m.availableActions.includes('create'),
          edit: m.availableActions.includes('edit'),
          delete: m.availableActions.includes('delete')
        };
      });
      return updated;
    });
    setIsModified(true);
  };

  const handleRevokeAll = () => {
    setLocalPermissions(() => {
      const updated: any = {};
      modules.forEach((m) => {
        updated[m.id] = { view: false, create: false, edit: false, delete: false };
      });
      return updated;
    });
    setIsModified(true);
  };

  const handleToggleRowFull = (moduleId: string) => {
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return;
    setLocalPermissions((prev) => ({
      ...prev,
      [moduleId]: {
        view: true,
        create: mod.availableActions.includes('create'),
        edit: mod.availableActions.includes('edit'),
        delete: mod.availableActions.includes('delete')
      }
    }));
    setIsModified(true);
  };

  const handleToggleRowNone = (moduleId: string) => {
    setLocalPermissions((prev) => ({
      ...prev,
      [moduleId]: { view: false, create: false, edit: false, delete: false }
    }));
    setIsModified(true);
  };

  // Mutation: Save Role Permissions
  const savePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!activeMatrixRole) return;
      const formatted = Object.entries(localPermissions).map(([module, perms]) => ({
        module,
        ...perms
      }));
      const res = await api.post(
        `/auth/admin/roles/${activeMatrixRole._id}/permissions?workspaceId=${currentWorkspace?._id}`,
        { permissions: formatted }
      );
      return res.data;
    },
    onSuccess: () => {
      setIsModified(false);
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['role-permissions', activeMatrixRole?._id] });
      queryClient.invalidateQueries({ queryKey: ['workspace-roles'] });
      if (currentWorkspace?._id) {
        fetchPermissions(currentWorkspace._id);
      }
    }
  });

  // Mutation: Create Role
  const createRoleMutation = useMutation({
    mutationFn: async () => {
      let initialPerms: any[] = [];
      if (newRoleTemplate === 'admin') {
        initialPerms = modules.map((m) => ({
          module: m.id,
          view: true,
          create: true,
          edit: true,
          delete: true
        }));
      } else if (newRoleTemplate === 'pm') {
        initialPerms = modules.map((m) => ({
          module: m.id,
          view: m.id !== 'roles',
          create: m.id !== 'roles',
          edit: m.id !== 'roles',
          delete: ['board', 'backlog', 'teams', 'docs', 'forms', 'requests'].includes(m.id)
        }));
      } else if (newRoleTemplate === 'lead') {
        initialPerms = modules.map((m) => ({
          module: m.id,
          view: !['admin', 'roles'].includes(m.id),
          create: ['board', 'backlog', 'teams', 'docs', 'forms', 'requests'].includes(m.id),
          edit: ['board', 'backlog', 'teams', 'docs', 'forms', 'requests'].includes(m.id),
          delete: ['board', 'docs'].includes(m.id)
        }));
      } else if (newRoleTemplate === 'member') {
        initialPerms = modules.map((m) => ({
          module: m.id,
          view: !['admin', 'roles'].includes(m.id),
          create: ['board', 'backlog', 'docs', 'requests'].includes(m.id),
          edit: ['board', 'backlog', 'docs', 'requests'].includes(m.id),
          delete: false
        }));
      }

      const res = await api.post(`/auth/admin/roles?workspaceId=${currentWorkspace?._id}`, {
        name: newRoleName.trim(),
        key: (newRoleKey || newRoleName).toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        description: newRoleDesc.trim(),
        level: newRoleLevel,
        permissions: initialPerms
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-roles'] });
      setIsCreateModalOpen(false);
      setNewRoleName('');
      setNewRoleKey('');
      setNewRoleDesc('');
      setNewRoleLevel(4);
      setCreateError(null);
      if (data?.data) {
        setActiveMatrixRole(data.data);
      }
    },
    onError: (err: any) => {
      setCreateError(err.response?.data?.error || 'Failed to create role');
    }
  });

  // Mutation: Update Role Details
  const updateRoleMutation = useMutation({
    mutationFn: async () => {
      if (!editRole) return;
      const res = await api.put(`/auth/admin/roles/${editRole._id}?workspaceId=${currentWorkspace?._id}`, {
        name: editRoleName.trim(),
        description: editRoleDesc.trim(),
        level: editRoleLevel
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-roles'] });
      setIsEditModalOpen(false);
      setEditRole(null);
    }
  });

  // Mutation: Delete Role
  const deleteRoleMutation = useMutation({
    mutationFn: async () => {
      if (!roleToDelete) return;
      const res = await api.delete(`/auth/admin/roles/${roleToDelete._id}?workspaceId=${currentWorkspace?._id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-roles'] });
      setIsDeleteModalOpen(false);
      setRoleToDelete(null);
      if (activeMatrixRole?._id === roleToDelete?._id) {
        setActiveMatrixRole(null);
      }
    }
  });

  // Format Date Helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  // Filtered Roles
  const filteredRoles = roles.filter((role) => {
    const matchSearch =
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchSearch) return false;

    if (filterType === 'custom') return !role.isSystemRole;
    if (filterType === 'system') return role.isSystemRole;
    return true;
  });

  const totalMembers = roles.reduce((acc, r) => acc + (r.memberCount || 0), 0);

  const getModuleIcon = (id: string) => {
    switch (id) {
      case 'dashboard':
        return <LayoutDashboard className="w-4 h-4 text-blue-600" />;
      case 'summary':
        return <FolderKanban className="w-4 h-4 text-indigo-600" />;
      case 'board':
        return <Kanban className="w-4 h-4 text-emerald-600" />;
      case 'backlog':
        return <ListFilter className="w-4 h-4 text-amber-600" />;
      case 'teams':
        return <Users className="w-4 h-4 text-cyan-600" />;
      case 'analytics':
        return <BarChart2 className="w-4 h-4 text-rose-600" />;
      case 'docs':
        return <FileText className="w-4 h-4 text-orange-600" />;
      case 'forms':
        return <FileCheck2 className="w-4 h-4 text-blue-500" />;
      case 'requests':
        return <Inbox className="w-4 h-4 text-pink-600" />;
      case 'admin':
        return <ShieldCheck className="w-4 h-4 text-red-600" />;
      case 'roles':
        return <Lock className="w-4 h-4 text-violet-600" />;
      default:
        return <Shield className="w-4 h-4 text-slate-500" />;
    }
  };

  if (!isOrgAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center select-none">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4 border border-rose-200">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-black text-[#0F172A]">Access Restricted</h3>
        <p className="text-sm text-slate-500 max-w-md mt-1 font-medium">
          Roles & Tab Permissions configuration is restricted to Organization Administrators only.
        </p>
      </div>
    );
  }

  // Full-Canvas Permissions Matrix View (Keeps Sidebar & Navbar 100% visible)
  if (activeMatrixRole) {
    return (
      <div className="flex flex-col gap-5 select-none text-[#111827]">
        {/* Top Header Banner */}
        <div className="bg-[#0B132B] rounded-2xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm border border-slate-800">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveMatrixRole(null)}
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-slate-200 hover:text-white cursor-pointer flex items-center gap-2 text-xs font-bold shrink-0 shadow-2xs"
              title="Back to Roles directory"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Roles</span>
            </button>

            <div className="h-8 w-px bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="font-black text-lg tracking-tight text-white">{activeMatrixRole.name}</h2>
                  <span className="text-xs font-mono font-bold bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 rounded-md text-blue-300">
                    {activeMatrixRole.key}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    {activeMatrixRole.isSystemRole ? 'System Preset' : 'Custom Org Role'}
                  </span>
                </div>
                <p className="text-xs text-slate-300/90 mt-0.5">
                  Configure granular tab access & actions for this role across the workspace
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/10 text-xs font-bold text-slate-200">
              <span className="text-emerald-400 font-extrabold">
                {Object.values(localPermissions).filter((p) => p.view).length}
              </span>
              <span>/ {modules.length} Tabs Active</span>
            </div>
          </div>
        </div>

        {/* Matrix Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Quick Actions & Search Strip */}
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-3 shrink-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleGrantAllView}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>Grant All View</span>
              </button>
              <button
                type="button"
                onClick={handleGrantAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                <span>Full Access</span>
              </button>
              <button
                type="button"
                onClick={handleRevokeAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>Revoke All</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  placeholder="Filter tabs / modules..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-56 transition-all"
                />
                {drawerSearch && (
                  <button
                    onClick={() => setDrawerSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {saveSuccessMsg && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg animate-fade-in">
                  <Check className="w-3.5 h-3.5" />
                  <span>Permissions Saved!</span>
                </div>
              )}
            </div>
          </div>

          {/* Permissions Matrix Table */}
          <div className="overflow-x-auto">
            {permissionsLoading ? (
              <div className="py-24 text-center text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-3" />
                <p className="text-xs font-bold text-slate-600">Loading permissions matrix...</p>
                <p className="text-[11px] text-slate-400 mt-1">Retrieving tab policies for {activeMatrixRole.name}</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-3.5 px-6">Workspace Tab / Module</th>
                    <th className="py-3.5 px-4 text-center w-36">View (Access)</th>
                    <th className="py-3.5 px-4 text-center w-28">Create</th>
                    <th className="py-3.5 px-4 text-center w-28">Edit</th>
                    <th className="py-3.5 px-4 text-center w-28">Delete</th>
                    <th className="py-3.5 px-6 text-center w-36">Quick Preset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {modules
                    .filter(
                      (mod) =>
                        mod.name.toLowerCase().includes(drawerSearch.toLowerCase()) ||
                        mod.description.toLowerCase().includes(drawerSearch.toLowerCase()) ||
                        mod.id.toLowerCase().includes(drawerSearch.toLowerCase())
                    )
                    .map((mod) => {
                      const perms = localPermissions[mod.id] || {
                        view: false,
                        create: false,
                        edit: false,
                        delete: false
                      };
                      const hasCreate = mod.availableActions.includes('create');
                      const hasEdit = mod.availableActions.includes('edit');
                      const hasDelete = mod.availableActions.includes('delete');

                      return (
                        <tr
                          key={mod.id}
                          className={`transition-colors ${
                            perms.view
                              ? 'bg-white hover:bg-blue-50/20'
                              : 'bg-slate-50/50 hover:bg-slate-100/50 opacity-60'
                          }`}
                        >
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3.5">
                              <div
                                className={`p-2.5 rounded-xl shrink-0 transition-colors ${
                                  perms.view ? 'bg-blue-50/80 text-blue-700' : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {getModuleIcon(mod.id)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-xs text-slate-900">{mod.name}</span>
                                  {perms.view ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      Tab Visible
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                      Tab Hidden
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 font-medium leading-tight mt-0.5 line-clamp-1">
                                  {mod.description}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggle(mod.id, 'view')}
                              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                perms.view ? 'bg-blue-600' : 'bg-slate-300'
                              }`}
                              title={perms.view ? 'Disable tab visibility' : 'Enable tab visibility'}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-200 ease-in-out my-0.5 ${
                                  perms.view ? 'translate-x-5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {!hasCreate ? (
                              <span className="text-slate-300 font-mono text-sm select-none">—</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!perms.view}
                                onClick={() => handleToggle(mod.id, 'create')}
                                className={`w-6 h-6 mx-auto rounded-md flex items-center justify-center transition-all ${
                                  !perms.view
                                    ? 'opacity-30 cursor-not-allowed border border-slate-200 bg-slate-100'
                                    : perms.create
                                    ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 cursor-pointer'
                                    : 'border-2 border-slate-300 bg-white hover:border-emerald-500 text-transparent cursor-pointer'
                                }`}
                                title={perms.create ? 'Revoke Create action' : 'Grant Create action'}
                              >
                                <Check className={`w-3.5 h-3.5 stroke-[3] ${perms.create ? 'text-white' : 'text-transparent'}`} />
                              </button>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {!hasEdit ? (
                              <span className="text-slate-300 font-mono text-sm select-none">—</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!perms.view}
                                onClick={() => handleToggle(mod.id, 'edit')}
                                className={`w-6 h-6 mx-auto rounded-md flex items-center justify-center transition-all ${
                                  !perms.view
                                    ? 'opacity-30 cursor-not-allowed border border-slate-200 bg-slate-100'
                                    : perms.edit
                                    ? 'bg-amber-500 text-white shadow-xs hover:bg-amber-600 cursor-pointer'
                                    : 'border-2 border-slate-300 bg-white hover:border-amber-500 text-transparent cursor-pointer'
                                }`}
                                title={perms.edit ? 'Revoke Edit action' : 'Grant Edit action'}
                              >
                                <Check className={`w-3.5 h-3.5 stroke-[3] ${perms.edit ? 'text-white' : 'text-transparent'}`} />
                              </button>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            {!hasDelete ? (
                              <span className="text-slate-300 font-mono text-sm select-none">—</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!perms.view}
                                onClick={() => handleToggle(mod.id, 'delete')}
                                className={`w-6 h-6 mx-auto rounded-md flex items-center justify-center transition-all ${
                                  !perms.view
                                    ? 'opacity-30 cursor-not-allowed border border-slate-200 bg-slate-100'
                                    : perms.delete
                                    ? 'bg-rose-600 text-white shadow-xs hover:bg-rose-700 cursor-pointer'
                                    : 'border-2 border-slate-300 bg-white hover:border-rose-500 text-transparent cursor-pointer'
                                }`}
                                title={perms.delete ? 'Revoke Delete action' : 'Grant Delete action'}
                              >
                                <Check className={`w-3.5 h-3.5 stroke-[3] ${perms.delete ? 'text-white' : 'text-transparent'}`} />
                              </button>
                            )}
                          </td>

                          <td className="py-3.5 px-6 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggleRowFull(mod.id)}
                                className="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="Grant full access to this tab"
                              >
                                Full
                              </button>
                              <span className="text-slate-300 text-xs">|</span>
                              <button
                                type="button"
                                onClick={() => handleToggleRowNone(mod.id)}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Revoke all access to this tab"
                              >
                                None
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                  {modules.filter(
                    (mod) =>
                      mod.name.toLowerCase().includes(drawerSearch.toLowerCase()) ||
                      mod.description.toLowerCase().includes(drawerSearch.toLowerCase()) ||
                      mod.id.toLowerCase().includes(drawerSearch.toLowerCase())
                  ).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-xs text-slate-400">
                        No workspace tabs match "{drawerSearch}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Bottom Actions Bar */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-600">
                {Object.values(localPermissions).filter((p) => p.view).length} of {modules.length} tabs visible to members
              </span>
              {isModified && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveMatrixRole(null)}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors cursor-pointer"
              >
                Back to Roles
              </button>

              <button
                type="button"
                disabled={!isModified || savePermissionsMutation.isPending}
                onClick={() => savePermissionsMutation.mutate()}
                className={`flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-xl transition-all shadow-sm ${
                  isModified
                    ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {savePermissionsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Role Permissions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 select-none text-[#111827]">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-[#0F172A] rounded-2xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-bold tracking-tight">
              {currentWorkspace?.name || 'Organization'} • Roles & Tab Permissions
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Define custom security roles for your organization. Control which members can view specific tabs (Board, Backlog, Analytics, Teams, Docs) and what actions they can perform.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setNewRoleName('');
              setNewRoleKey('');
              setNewRoleDesc('');
              setCreateError(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Role</span>
          </button>
        </div>
      </div>

      {/* 2. STATS SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Configured Roles</span>
            <Shield className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-[#111827] mt-1.5">
            {roles.length}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">
            {roles.filter((r) => r.isSystemRole).length} system • {roles.filter((r) => !r.isSystemRole).length} custom
          </div>
        </div>

        <div className="p-4 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Total Assigned Members</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-[#111827] mt-1.5">
            {totalMembers}
          </div>
          <div className="text-xs text-emerald-600 font-bold mt-0.5">
            Active in this organization
          </div>
        </div>

        <div className="p-4 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Protected Modules / Tabs</span>
            <Lock className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-black text-[#111827] mt-1.5">
            {modules.length}
          </div>
          <div className="text-xs text-slate-500 font-medium mt-0.5">
            With granular View, Create, Edit, Delete rules
          </div>
        </div>
      </div>

      {/* 3. ROLES DIRECTORY & TABLE */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-[#0F172A]/10 p-5 shadow-xs space-y-4">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#0F172A]/10">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search roles by name or key..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl focus:bg-white focus:border-blue-600 outline-none font-medium text-[#111827]"
            />
          </div>

          <div className="flex items-center gap-1 bg-[#F3F4F6] p-1 rounded-xl border border-[#0F172A]/10 self-start sm:self-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({roles.length})
            </button>
            <button
              onClick={() => setFilterType('custom')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterType === 'custom'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Custom ({roles.filter((r) => !r.isSystemRole).length})
            </button>
            <button
              onClick={() => setFilterType('system')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filterType === 'system'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              System ({roles.filter((r) => r.isSystemRole).length})
            </button>
          </div>
        </div>

        {/* Roles Table */}
        {rolesLoading ? (
          <div className="py-16 text-center text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin mx-auto text-blue-600 mb-2" />
            <p className="text-xs font-semibold">Loading organization roles...</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-4">Role Name & Key</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Used By (Members)</th>
                  <th className="py-3 px-4">Created By & At</th>
                  <th className="py-3 px-4">Used At / Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredRoles.map((role) => {
                  return (
                    <tr
                      key={role._id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => setActiveMatrixRole(role)}
                    >
                      {/* 1. Role Name & Key */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/80 flex items-center justify-center shrink-0">
                            <Shield className="w-4.5 h-4.5 text-blue-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {role.name}
                              </span>
                              {role.isSystemRole ? (
                                <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                  System
                                </span>
                              ) : (
                                <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                  Custom
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 font-bold mt-0.5">
                              KEY: {role.key}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Description */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <span className="text-slate-600 font-medium text-xs line-clamp-2">
                          {role.description || 'No description provided'}
                        </span>
                      </td>

                      {/* 4. Used By (Members) */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          {role.usedBy && role.usedBy.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              {/* Stacked Avatar Cluster */}
                              <div className="flex -space-x-2 overflow-hidden">
                                {role.usedBy.slice(0, 3).map((m, idx) => (
                                  <div
                                    key={m._id || idx}
                                    title={`${m.name} (${m.email})`}
                                    className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white shadow-2xs"
                                  >
                                    {m.avatar ? (
                                      <img
                                        src={m.avatar}
                                        alt={m.name}
                                        className="w-full h-full rounded-full object-cover"
                                      />
                                    ) : (
                                      m.name.charAt(0).toUpperCase()
                                    )}
                                  </div>
                                ))}
                              </div>

                              <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                                {role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-semibold italic">
                              0 assigned
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Created By & At */}
                      <td className="py-3.5 px-4">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{role.createdBy?.name || 'System Initializer'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {formatDate(role.createdAt)}
                          </div>
                        </div>
                      </td>

                      {/* 6. Used At / Updated At */}
                      <td className="py-3.5 px-4">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDate(role.lastUsedAt || role.updatedAt)}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {role.updatedBy?.name ? `by ${role.updatedBy.name}` : 'Active in workspace'}
                          </div>
                        </div>
                      </td>

                      {/* 7. Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setActiveMatrixRole(role)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
                            title="Configure tab permissions"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            <span>Permissions</span>
                          </button>

                          {!role.isSystemRole && (
                            <>
                              <button
                                onClick={() => {
                                  setEditRole(role);
                                  setEditRoleName(role.name);
                                  setEditRoleDesc(role.description || '');
                                  setEditRoleLevel(role.level || 4);
                                  setIsEditModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                title="Edit Role details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => {
                                  setRoleToDelete(role);
                                  setIsDeleteModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Role"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredRoles.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                      No roles found matching "{searchTerm}".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. CREATE ROLE MODAL */}
      {isCreateModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Create New Custom Role</span>
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., QA Engineer, Hardware Lead, Guest"
                  value={newRoleName}
                  onChange={(e) => {
                    setNewRoleName(e.target.value);
                    if (!newRoleKey || newRoleKey === newRoleName.toUpperCase().replace(/[^A-Z0-9_]/g, '_')) {
                      setNewRoleKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'));
                    }
                  }}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role Key / Code Identifier <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., QA_ENGINEER"
                  value={newRoleKey}
                  onChange={(e) => setNewRoleKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of duties and permissions"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Hierarchy Level <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  Assign administrative authority rank across organization workspaces, projects, and teams.
                </p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {[
                    {
                      lvl: 1,
                      title: 'Level 1 · Org Admin / Executive',
                      desc: 'Full org control (CEO, Founders, Superadmins). Full tab & settings access.',
                      tpl: 'admin' as const
                    },
                    {
                      lvl: 2,
                      title: 'Level 2 · Project Manager',
                      desc: 'Can create & manage projects, create teams, assign leads & members.',
                      tpl: 'pm' as const
                    },
                    {
                      lvl: 3,
                      title: 'Level 3 · Team Lead',
                      desc: 'Team operational lead. Manage team tasks, boards, and workflows.',
                      tpl: 'lead' as const
                    },
                    {
                      lvl: 4,
                      title: 'Level 4 · Contributor / Member',
                      desc: 'Standard team contributor (Developers, Designers, QA). Assigned tasks & docs.',
                      tpl: 'member' as const
                    },
                    {
                      lvl: 5,
                      title: 'Level 5 · Viewer / Guest',
                      desc: 'Read-only stakeholder with view permissions only.',
                      tpl: 'empty' as const
                    }
                  ].map((item) => (
                    <div
                      key={item.lvl}
                      onClick={() => {
                        setNewRoleLevel(item.lvl);
                        setNewRoleTemplate(item.tpl);
                      }}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        newRoleLevel === item.lvl
                          ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{item.title}</span>
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                            newRoleLevel === item.lvl
                              ? 'border-blue-600 bg-blue-600'
                              : 'border-slate-300'
                          }`}
                        >
                          {newRoleLevel === item.lvl && (
                            <span className="w-1.5 h-1.5 bg-white rounded-full" />
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Initial Permission Template
                </label>
                <select
                  value={newRoleTemplate}
                  onChange={(e) => setNewRoleTemplate(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-semibold"
                >
                  <option value="admin">Full Admin (Full access to all tabs)</option>
                  <option value="pm">Project Manager Template (Projects, Teams, Backlog, Docs)</option>
                  <option value="lead">Team Lead Template (Board, Backlog, Teams, Docs)</option>
                  <option value="member">Standard Member (Board, Backlog, Docs access)</option>
                  <option value="empty">Blank (No access - configure manually)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!newRoleName.trim() || createRoleMutation.isPending}
                onClick={() => createRoleMutation.mutate()}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {createRoleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Create Role</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 6. EDIT ROLE MODAL */}
      {isEditModalOpen && editRole && isMounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-600" />
                <span>Edit Role: {editRole.name}</span>
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role Name</label>
                <input
                  type="text"
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Hierarchy Level</label>
                <select
                  value={editRoleLevel}
                  onChange={(e) => setEditRoleLevel(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-semibold"
                >
                  <option value={1}>Level 1 · Organization Admin / Executive (CEO, Founders)</option>
                  <option value={2}>Level 2 · Project Manager (Create projects & teams)</option>
                  <option value={3}>Level 3 · Team Lead (Team operations)</option>
                  <option value={4}>Level 4 · Contributor / Member (Standard tasks & docs)</option>
                  <option value={5}>Level 5 · Viewer / Guest (Read-only)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Adjusting the hierarchy level will change the role's authority for creating projects and managing teams.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editRoleDesc}
                  onChange={(e) => setEditRoleDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={!editRoleName.trim() || updateRoleMutation.isPending}
                onClick={() => updateRoleMutation.mutate()}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {updateRoleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 7. DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && roleToDelete && isMounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-full bg-red-50">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Delete Role</h3>
                <p className="text-xs text-slate-500">Are you sure you want to delete this role?</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-medium bg-slate-50 p-3 rounded-xl border border-slate-200">
              Deleting <strong>{roleToDelete.name}</strong> will remove it from the organization. Any members currently assigned to this role will be reset to default Member permissions.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={deleteRoleMutation.isPending}
                onClick={() => deleteRoleMutation.mutate()}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                {deleteRoleMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Role</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
