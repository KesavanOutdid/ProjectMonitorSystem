'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { usePermissionStore } from '../store/permissionStore';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { InviteModal } from './InviteModal';
import {
  Users,
  UserPlus,
  Plus,
  Search,
  FolderKanban,
  Check,
  X,
  Edit2,
  Trash2,
  Crown,
  Layers,
  Sparkles,
  Shield,
  Loader2,
  Filter,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  ChevronRight,
  MoreVertical,
  UserX,
  Table,
  LayoutGrid
} from 'lucide-react';

interface TeamMember {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
  jobTitle?: string;
  department?: string;
}

interface TeamItem {
  _id: string;
  name: string;
  key: string;
  description: string;
  color: string;
  icon: string;
  department: string;
  leadId?: TeamMember | null;
  members: TeamMember[];
  projectId?: {
    _id: string;
    name: string;
    key: string;
    color?: string;
  } | null;
  createdBy?: {
    _id: string;
    name: string;
    email: string;
  };
  memberCount: number;
  totalTasks: number;
  completedTasks: number;
  completionPercent: number;
  createdAt: string;
  updatedAt: string;
}

const COLOR_PRESETS = [
  '#2563EB', // Blue
  '#7C3AED', // Violet
  '#059669', // Emerald
  '#D97706', // Amber
  '#DC2626', // Red
  '#0891B2', // Cyan
  '#4F46E5', // Indigo
  '#DB2777', // Pink
  '#475569'  // Slate
];

const DEPARTMENTS = [
  'Engineering',
  'Hardware',
  'Firmware',
  'PCB Design',
  'Design & UI/UX',
  'Product',
  'Quality Assurance (QA)',
  'Operations',
  'Marketing',
];

const generateSmartKey = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/[\s\-_]+/);
  if (words.length > 1) {
    return words.map((w) => w[0] || '').join('').toUpperCase().slice(0, 4);
  }
  return (trimmed[0] || '').toUpperCase();
};

export const TeamManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, currentWorkspace } = useAuthStore();
  const { canCreate, canEdit, canDelete } = usePermissionStore();

  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isProjectManager = user?.role === 'PROJECT_MANAGER';
  const canManage = isOrgAdmin || isProjectManager;

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamItem | null>(null);
  const [manageMembersTeam, setManageMembersTeam] = useState<TeamItem | null>(null);
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<TeamItem | null>(null);
  const [inviteTeamTarget, setInviteTeamTarget] = useState<TeamItem | null>(null);

  // Form State for Create / Edit Team
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    color: '#2563EB',
    department: 'Engineering',
    leadId: '',
    memberIds: [] as string[]
  });
  const [isKeyManuallyEdited, setIsKeyManuallyEdited] = useState(false);

  // Member Search State inside Modals
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // 1. Fetch Teams for current workspace
  const { data: teams = [], isLoading: teamsLoading } = useQuery<TeamItem[]>({
    queryKey: ['workspace-teams', currentWorkspace?._id],
    queryFn: async () => {
      const res = await api.get(`/teams?workspaceId=${currentWorkspace?._id}`);
      return res.data?.data || [];
    },
    enabled: !!currentWorkspace?._id
  });

  // 2. Fetch Workspace Members
  const { data: workspaceMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ['workspace-members-list', currentWorkspace?._id],
    queryFn: async () => {
      const res = await api.get(`/workspaces/${currentWorkspace?._id}/members`);
      return res.data?.data || [];
    },
    enabled: !!currentWorkspace?._id
  });

  // Mutations
  const createTeamMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await api.post('/teams', {
        ...payload,
        workspaceId: currentWorkspace?._id,
        members: payload.memberIds,
        projectId: null,
        leadId: payload.leadId || null
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-teams', currentWorkspace?._id] });
      setIsCreateModalOpen(false);
      resetForm();
    }
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (payload: typeof formData & { teamId: string }) => {
      const res = await api.put(`/teams/${payload.teamId}`, {
        ...payload,
        members: payload.memberIds,
        projectId: null,
        leadId: payload.leadId || null
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-teams', currentWorkspace?._id] });
      setEditingTeam(null);
      resetForm();
    }
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await api.delete(`/teams/${teamId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-teams', currentWorkspace?._id] });
      setDeleteConfirmTeam(null);
    }
  });

  const addMembersMutation = useMutation({
    mutationFn: async ({ teamId, userIds }: { teamId: string; userIds: string[] }) => {
      const res = await api.post(`/teams/${teamId}/members`, { userIds });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-teams', currentWorkspace?._id] });
      if (manageMembersTeam && data?.data) {
        setManageMembersTeam(data.data);
      }
    }
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const res = await api.delete(`/teams/${teamId}/members/${userId}`);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-teams', currentWorkspace?._id] });
      if (manageMembersTeam && data?.data) {
        setManageMembersTeam(data.data);
      }
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      key: '',
      description: '',
      color: '#2563EB',
      department: 'Engineering',
      leadId: '',
      memberIds: []
    });
  };

  const handleOpenCreateModal = () => {
    resetForm();
    const randomColor = COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)];
    setFormData((prev) => ({ ...prev, color: randomColor }));
    setIsKeyManuallyEdited(false);
    setMemberSearchQuery('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (team: TeamItem) => {
    setEditingTeam(team);
    setIsKeyManuallyEdited(true);
    setMemberSearchQuery('');
    setFormData({
      name: team.name,
      key: team.key,
      description: team.description || '',
      color: team.color || '#2563EB',
      department: team.department || 'Engineering',
      leadId: team.leadId?._id || '',
      memberIds: team.members.map((m) => m._id)
    });
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingTeam) {
      updateTeamMutation.mutate({ ...formData, teamId: editingTeam._id });
    } else {
      createTeamMutation.mutate(formData);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    if (formData.memberIds.includes(userId)) {
      setFormData({
        ...formData,
        memberIds: formData.memberIds.filter((id) => id !== userId),
        leadId: formData.leadId === userId ? '' : formData.leadId
      });
    } else {
      setFormData({
        ...formData,
        memberIds: [...formData.memberIds, userId]
      });
    }
  };

  // Filtered Teams
  const filteredTeams = teams.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.leadId && t.leadId.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDept = departmentFilter === 'ALL' || t.department === departmentFilter;

    return matchesSearch && matchesDept;
  });

  // Global Metrics
  const totalTeams = teams.length;
  const uniqueAssignedMemberIds = new Set<string>();
  const uniqueLeads = new Set<string>();
  teams.forEach((t) => {
    t.members.forEach((m) => uniqueAssignedMemberIds.add(m._id));
    if (t.leadId) uniqueLeads.add(t.leadId._id);
  });
  const unassignedMembersCount = Math.max(0, workspaceMembers.length - uniqueAssignedMemberIds.size);

  return (
    <div className="flex flex-col gap-6 select-none animate-slide-up text-[#111827]">
      {/* Top Banner */}
      <div className="bg-[#0F172A] rounded-2xl p-6 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-bold tracking-tight">
              {currentWorkspace?.name || 'Organization'} • Team & Department Management
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Create cross-functional teams, assign team leads, organize departmental units, and manage member participation across the organization.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <>
              <button
                onClick={() => setInviteTeamTarget({ _id: '', name: 'Team' } as any)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all border border-white/20 active:scale-95 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5 text-[#22C55E]" />
                <span>Invite Members</span>
              </button>
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-[#2563EB] hover:bg-blue-600 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Team</span>
              </button>
            </>
          )}
          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl text-xs font-bold border border-white/10">
            <span className="w-2 h-2 rounded-full bg-[#22C55E]" />
            <span>Organization Teams</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Total Teams</span>
            <Layers className="w-4.5 h-4.5 text-blue-600" />
          </div>
          <div className="text-3xl font-black text-[#111827] mt-2">{totalTeams}</div>
          <div className="text-xs text-blue-600 font-bold mt-1">Configured functional units</div>
        </div>

        <div className="p-5 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Assigned Members</span>
            <Users className="w-4.5 h-4.5 text-[#22C55E]" />
          </div>
          <div className="text-3xl font-black text-[#111827] mt-2">{uniqueAssignedMemberIds.size}</div>
          <div className="text-xs text-[#22C55E] font-bold mt-1">Active team contributors</div>
        </div>

        <div className="p-5 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Unassigned Members</span>
            <UserX className="w-4.5 h-4.5 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-[#111827] mt-2">{unassignedMembersCount}</div>
          <div className="text-xs text-amber-600 font-bold mt-1">Available for assignment</div>
        </div>

        <div className="p-5 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
            <span>Active Team Leads</span>
            <Crown className="w-4.5 h-4.5 text-purple-600" />
          </div>
          <div className="text-3xl font-black text-[#111827] mt-2">{uniqueLeads.size}</div>
          <div className="text-xs text-purple-600 font-bold mt-1">Designated leaders</div>
        </div>
      </div>

      {/* Toolbar Filters */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-[#0F172A]/10 p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search teams by name, key, lead, or department..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-medium text-[#111827]"
          />
        </div>

        {/* Filters & View Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Department:</span>
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="text-xs sm:text-sm bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl px-3 py-2 outline-none font-semibold text-[#111827]"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          {/* Table / Grid View Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Table View (Full width)"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Card Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
          </div>
        </div>
      </div>

      {/* Teams Display */}
      {teamsLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white/80 rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs font-semibold text-slate-500">Loading organization teams...</span>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-4">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-900">No teams found</h3>
          <p className="text-xs text-slate-500 max-w-md mt-1 mb-5">
            {searchTerm || departmentFilter !== 'ALL'
              ? 'No teams match your active search filters. Try resetting the filters.'
              : 'Organize your workspace by creating teams like Engineering, Hardware, Firmware, or QA.'}
          </p>
          {canManage && (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
            >
              + Create First Team
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* Full-Width Table View */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[11px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <th className="py-3 px-4">Team Name & Key</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Designated Lead</th>
                <th className="py-3 px-4">Members</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredTeams.map((team) => (
                <tr
                  key={team._id}
                  className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  onClick={() => {
                    setManageMembersTeam(team);
                    setMemberSearchQuery('');
                  }}
                >
                  {/* 1. Team Name & Key */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-extrabold text-xs shadow-2xs shrink-0"
                        style={{ backgroundColor: team.color || '#2563EB' }}
                      >
                        {team.key || team.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">{team.name}</span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {team.key}
                          </span>
                        </div>
                        {team.description ? (
                          <p className="text-[11px] text-slate-500 font-medium line-clamp-1 mt-0.5 max-w-xs">
                            {team.description}
                          </p>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No description</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 2. Department */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                      {team.department}
                    </span>
                  </td>

                  {/* 3. Designated Lead */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {team.leadId ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] border border-purple-200">
                          {team.leadId.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                            <span>{team.leadId.name}</span>
                            <Crown className="w-3.5 h-3.5 text-amber-500" />
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {team.leadId.email}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium italic">
                        Unassigned Lead
                      </span>
                    )}
                  </td>

                  {/* 4. Members */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {team.members.length > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-2 overflow-hidden">
                            {team.members.slice(0, 4).map((m) => (
                              <div
                                key={m._id}
                                title={`${m.name} (${m.email})`}
                                className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white shadow-2xs"
                              >
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                            {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-semibold italic">0 members</span>
                      )}
                    </div>
                  </td>

                  {/* 5. Actions */}
                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => {
                          setManageMembersTeam(team);
                          setMemberSearchQuery('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold border border-blue-200 transition-colors cursor-pointer"
                        title="Manage team members"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Members</span>
                      </button>

                      {canManage && (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(team)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit Team"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setDeleteConfirmTeam(team)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Team"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTeams.map((team) => (
            <div
              key={team._id}
              className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group"
            >
              {/* Card Header */}
              <div className="p-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow-xs shrink-0"
                      style={{ backgroundColor: team.color || '#2563EB' }}
                    >
                      {team.key || team.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-sm">{team.name}</h3>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {team.key}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-medium">
                        <span className="font-semibold text-slate-700">{team.department}</span>
                        <span>•</span>
                        <span className="text-slate-500">Organization Unit</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Dropdown / Buttons */}
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditModal(team)}
                        title="Edit team"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmTeam(team)}
                        title="Delete team"
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Description */}
                {team.description && (
                  <p className="text-xs text-slate-600 mt-3 line-clamp-2 leading-relaxed">
                    {team.description}
                  </p>
                )}

                {/* Lead Section */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                    Team Lead
                  </span>
                  {team.leadId ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] border border-purple-200">
                        {team.leadId.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-800 text-xs">
                        {team.leadId.name}
                      </span>
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                  ) : (
                    <span className="text-slate-400 italic text-xs">Unassigned</span>
                  )}
                </div>

                {/* Member Avatars Stack */}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
                    Members ({team.members.length})
                  </span>

                  <div className="flex items-center -space-x-1.5 overflow-hidden">
                    {team.members.slice(0, 5).map((m) => (
                      <div
                        key={m._id}
                        title={`${m.name} (${m.email})`}
                        className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-700 shadow-2xs"
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {team.members.length > 5 && (
                      <div className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[9px] font-bold text-slate-500 shadow-2xs">
                        +{team.members.length - 5}
                      </div>
                    )}
                    {team.members.length === 0 && (
                      <span className="text-slate-400 italic text-xs">No members</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => {
                    setManageMembersTeam(team);
                    setMemberSearchQuery('');
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Manage Members</span>
                </button>

                {canManage && (
                  <button
                    onClick={() => {
                      setManageMembersTeam(team);
                      setMemberSearchQuery('');
                    }}
                    className="p-1 px-2.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all shadow-2xs cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 text-blue-500" />
                    <span>+ Add</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── CREATE / EDIT TEAM MODAL ─── */}
      {(isCreateModalOpen || editingTeam) &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      {editingTeam ? `Edit Team: ${editingTeam.name}` : 'Create New Team'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Configure team details, assign leader, and select members.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingTeam(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSubmitForm} className="p-6 overflow-y-auto flex flex-col gap-4">
                {/* Team Name & Key */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Team Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Hardware Engineering"
                      value={formData.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          name,
                          key: isKeyManuallyEdited ? prev.key : generateSmartKey(name)
                        }));
                      }}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-semibold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Team Key / Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HE"
                      value={formData.key}
                      onChange={(e) => {
                        setIsKeyManuallyEdited(true);
                        setFormData((prev) => ({ ...prev, key: e.target.value.toUpperCase() }));
                      }}
                      className="w-full px-3 py-2 text-xs sm:text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-mono font-bold text-slate-900 uppercase"
                    />
                  </div>
                </div>

                {/* Department */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-medium text-slate-900"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color Preset Picker - only shown when editing an existing team */}
                {editingTeam && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Team Badge Color
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: c })}
                          className={`w-7 h-7 rounded-lg transition-transform cursor-pointer flex items-center justify-center ${
                            formData.color === c ? 'scale-110 ring-2 ring-blue-500 ring-offset-2' : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: c }}
                        >
                          {formData.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Team Lead Assignment */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Designated Team Lead
                  </label>
                  <select
                    value={formData.leadId}
                    onChange={(e) => {
                      const leadId = e.target.value;
                      const nextMembers = leadId && !formData.memberIds.includes(leadId)
                        ? [...formData.memberIds, leadId]
                        : formData.memberIds;
                      setFormData({ ...formData, leadId, memberIds: nextMembers });
                    }}
                    className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-medium text-slate-900"
                  >
                    <option value="">Select a team lead (optional)</option>
                    {workspaceMembers.map((m) => {
                      const isDesignatedLead = (m.role || '').toUpperCase() === 'TEAM_LEAD';
                      return (
                        <option key={m._id} value={m._id}>
                          {m.name} ({m.email}) {isDesignatedLead ? '• [Team Lead]' : `• [${m.role || 'Member'}]`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Select Initial Members */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Team Members ({formData.memberIds.length} selected)
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Check members to assign to this team
                    </span>
                  </div>

                  {/* Search members */}
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter members by name or email..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-slate-200 rounded-lg outline-none focus:bg-white font-medium"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 flex flex-col gap-1 bg-[#F8FAFC]">
                    {workspaceMembers
                      .filter((m) =>
                        m.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                        m.email.toLowerCase().includes(memberSearchQuery.toLowerCase())
                      )
                      .map((m) => {
                        const isChecked = formData.memberIds.includes(m._id);
                        const isLead = formData.leadId === m._id;
                        return (
                          <div
                            key={m._id}
                            onClick={() => toggleMemberSelection(m._id)}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                              isChecked ? 'bg-blue-50 border border-blue-200 font-semibold' : 'hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="rounded text-blue-600 pointer-events-none"
                              />
                              <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-800">
                                {m.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-slate-900 truncate">{m.name}</span>
                              <span className="text-slate-400 text-[11px] truncate">({m.email})</span>
                            </div>

                            {isLead && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold shrink-0">
                                Team Lead
                              </span>
                            )}
                          </div>
                        );
                      })}
                    {workspaceMembers.length === 0 && (
                      <span className="text-xs text-slate-400 p-3 text-center">
                        No workspace members available. Invite members first.
                      </span>
                    )}
                  </div>
                </div>

                {/* Description - only shown when editing an existing team */}
                {editingTeam && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Team Description
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Brief description of the team's mission, goals, and responsibilities..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-medium text-slate-900"
                    />
                  </div>
                )}

                {/* Submit Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setEditingTeam(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTeamMutation.isPending || updateTeamMutation.isPending}
                    className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {(createTeamMutation.isPending || updateTeamMutation.isPending) && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>{editingTeam ? 'Save Changes' : 'Create Team'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* ─── MANAGE MEMBERS MODAL ─── */}
      {manageMembersTeam &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-scale-up">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs"
                    style={{ backgroundColor: manageMembersTeam.color || '#2563EB' }}
                  >
                    {manageMembersTeam.key}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Manage Team: {manageMembersTeam.name}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {canManage
                        ? 'Add and remove members directly from this functional team.'
                        : 'View assigned members of this functional team.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setManageMembersTeam(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex flex-col gap-5">
                {/* Add Member Dropdown / Action (Org Admin only) */}
                {canManage && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-slate-700">
                        Add Workspace Member to Team
                      </label>
                      <button
                        type="button"
                        onClick={() => setInviteTeamTarget(manageMembersTeam)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Invite New via Email</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        id="addMemberSelect"
                        className="flex-1 px-3 py-2 text-xs bg-[#F8FAFC] border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 font-medium text-slate-900"
                      >
                        <option value="">Select a member to add...</option>
                        {workspaceMembers
                          .filter(
                            (wm) => !manageMembersTeam.members.some((tm) => tm._id === wm._id)
                          )
                          .map((wm) => (
                            <option key={wm._id} value={wm._id}>
                              {wm.name} ({wm.email})
                            </option>
                          ))}
                      </select>

                      <button
                        onClick={() => {
                          const select = document.getElementById('addMemberSelect') as HTMLSelectElement;
                          if (select && select.value) {
                            addMembersMutation.mutate({
                              teamId: manageMembersTeam._id,
                              userIds: [select.value]
                            });
                            select.value = '';
                          }
                        }}
                        disabled={addMembersMutation.isPending}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {addMembersMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Current Members List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      Current Assigned Members ({manageMembersTeam.members.length})
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
                    {manageMembersTeam.members.map((member) => {
                      const isLead = manageMembersTeam.leadId?._id === member._id;
                      return (
                        <div
                          key={member._id}
                          className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-800">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900">
                                  {member.name}
                                </span>
                                {isLead && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center gap-0.5">
                                    <Crown className="w-2.5 h-2.5" />
                                    <span>Lead</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {member.email}
                              </span>
                            </div>
                          </div>

                          {canManage && (
                            <button
                              onClick={() =>
                                removeMemberMutation.mutate({
                                  teamId: manageMembersTeam._id,
                                  userId: member._id
                                })
                              }
                              title="Remove from team"
                              disabled={removeMemberMutation.isPending}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {manageMembersTeam.members.length === 0 && (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No members assigned yet. Use the selector above to add members.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setManageMembersTeam(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ─── DELETE CONFIRM MODAL (30-day Recycle Bin) ─── */}
      {deleteConfirmTeam &&
        typeof document !== 'undefined' &&
        createPortal(
          <DeleteConfirmModal
            isOpen={!!deleteConfirmTeam}
            onClose={() => setDeleteConfirmTeam(null)}
            onConfirm={() => deleteTeamMutation.mutateAsync(deleteConfirmTeam._id)}
            title="Move Team to Recycle Bin?"
            itemName={deleteConfirmTeam.name}
            itemType="Team"
            isLoading={deleteTeamMutation.isPending}
          />,
          document.body
        )}

      {/* ─── INVITE MODAL ─── */}
      {inviteTeamTarget && (
        <InviteModal
          isOpen={!!inviteTeamTarget}
          onClose={() => setInviteTeamTarget(null)}
          teamId={inviteTeamTarget._id || undefined}
          teamName={inviteTeamTarget._id ? inviteTeamTarget.name : undefined}
        />
      )}
    </div>
  );
};
