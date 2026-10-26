'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { formatRole } from '../lib/formatters';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Zap,
  TrendingUp,
  FolderKanban,
  Check,
  X,
  Edit2,
  Trash2,
  ArrowRight,
  Layers,
  Cpu,
  Code,
  ShieldAlert,
  Loader2,
  Filter,
  Building
} from 'lucide-react';

interface TeamsProgressViewProps {
  projectId: string;
  onSelectTask?: (task: any) => void;
  onNavigateTab?: (tab: string) => void;
}

export const TeamsProgressView: React.FC<TeamsProgressViewProps> = ({
  projectId,
  onSelectTask,
  onNavigateTab
}) => {
  const queryClient = useQueryClient();
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);
  const { user, currentWorkspace } = useAuthStore();
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('ALL');
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [selectedWorkspaceTeamIds, setSelectedWorkspaceTeamIds] = useState<string[]>([]);
  const [modalTab, setModalTab] = useState<'fetch' | 'create'>('fetch');
  const [isAddingSelected, setIsAddingSelected] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamKey, setNewTeamKey] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#2563EB');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamLeadId, setNewTeamLeadId] = useState('');

  // Fetch Project Teams Progress
  const { data: progressData, isLoading } = useQuery({
    queryKey: ['project-teams-progress', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}/teams-progress`);
      return res.data.data;
    },
    enabled: !!projectId,
    refetchInterval: 15000
  });

  // Fetch Project Assignable Members for Team Lead assignment
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/members`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });

  // Fetch Existing Organization Teams from Workspace
  const { data: workspaceTeams = [], isLoading: isLoadingWorkspaceTeams } = useQuery({
    queryKey: ['workspace-teams', currentWorkspace?._id],
    queryFn: async () => {
      const url = currentWorkspace?._id ? `/teams?workspaceId=${currentWorkspace._id}` : '/teams';
      const res = await api.get(url);
      return res.data.data || [];
    }
  });

  // Filter for Team Leads (users with TEAM_LEAD, LEAD, PM, or ADMIN role)
  const teamLeadCandidates = members.filter((m: any) => {
    const role = (m.role || m.userId?.role || m.jobTitle || '').toUpperCase();
    return ['TEAM_LEAD', 'LEAD', 'PROJECT_MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(role);
  });

  const availableTeamLeads = teamLeadCandidates.length > 0 ? teamLeadCandidates : members;

  // Create Team Mutation
  const createTeamMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      key: string;
      color: string;
      description: string;
      leadId: string;
    }) => {
      const res = await api.post(`/projects/${projectId}/teams`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-projects'] });
      setIsAddTeamModalOpen(false);
      setNewTeamName('');
      setNewTeamKey('');
      setNewTeamDescription('');
      setNewTeamLeadId('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to create team');
    }
  });

  const [isAddingAll, setIsAddingAll] = useState(false);

  // Delete Team Mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await api.delete(`/projects/${projectId}/teams/${teamId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-teams'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to remove team from project');
    }
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse max-w-7xl mx-auto">
        <div className="h-24 bg-white rounded-2xl border border-gray-200" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 bg-white rounded-2xl border border-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  const overview = progressData?.overview || {};
  const project = progressData?.project || {};
  const teams = progressData?.teams || [];

  const canManageTeams =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ORG_ADMIN' ||
    user?.role === 'PROJECT_MANAGER' ||
    (project?.leadId && String(project.leadId) === String(user?._id));

  const existingProjectTeamNames = new Set((teams || []).map((t: any) => t.name?.toLowerCase().trim()));
  const availableWorkspaceTeams = (workspaceTeams as any[]).filter(
    (wt: any) => !existingProjectTeamNames.has(wt.name?.toLowerCase().trim())
  );

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    createTeamMutation.mutate({
      name: newTeamName.trim(),
      key: newTeamKey.trim() || newTeamName.trim().slice(0, 3).toUpperCase(),
      color: newTeamColor,
      description: newTeamDescription,
      leadId: newTeamLeadId || ''
    });
  };

  const presetTeams = [
    { name: 'Hardware & PCB', key: 'HW', color: '#0284C7', desc: 'Schematics, board layout, and component engineering' },
    { name: 'Software & Cloud', key: 'SW', color: '#16A34A', desc: 'APIs, web frontend, and cloud backend' },
    { name: 'Firmware & Embedded', key: 'FW', color: '#9333EA', desc: 'Microcontroller code, drivers, and low-level firmware' },
    { name: 'QA & Testing', key: 'QA', color: '#EA580C', desc: 'Hardware test bench, integration validation, and QA' }
  ];

  const handleQuickAddPreset = (preset: typeof presetTeams[0]) => {
    createTeamMutation.mutate({
      name: preset.name,
      key: preset.key,
      color: preset.color,
      description: preset.desc,
      leadId: (user as any)?._id || ''
    });
  };

  const handleAddAllWorkspaceTeams = async () => {
    if (availableWorkspaceTeams.length === 0 || isAddingAll) return;
    setIsAddingAll(true);
    try {
      for (const wt of availableWorkspaceTeams) {
        await api.post(`/projects/${projectId}/teams`, {
          name: wt.name,
          key: wt.key || wt.name.slice(0, 3).toUpperCase(),
          color: wt.color || '#2563EB',
          description: wt.description || '',
          leadId: wt.leadId?._id || wt.leadId || ''
        });
      }
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-teams'] });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add all teams to project');
    } finally {
      setIsAddingAll(false);
    }
  };

  useEffect(() => {
    if (isAddTeamModalOpen) {
      setModalTab('fetch');
      setSelectedWorkspaceTeamIds(availableWorkspaceTeams.map((t: any) => t._id));
    }
  }, [isAddTeamModalOpen]);

  const handleAddSelectedTeams = async () => {
    if (selectedWorkspaceTeamIds.length === 0 || isAddingSelected) return;
    setIsAddingSelected(true);
    try {
      const teamsToAdd = (workspaceTeams as any[]).filter((wt: any) =>
        selectedWorkspaceTeamIds.includes(wt._id)
      );
      for (const wt of teamsToAdd) {
        await api.post(`/projects/${projectId}/teams`, {
          name: wt.name,
          key: wt.key || wt.name.slice(0, 3).toUpperCase(),
          color: wt.color || '#2563EB',
          description: wt.description || '',
          leadId: wt.leadId?._id || wt.leadId || ''
        });
      }
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-teams'] });
      setIsAddTeamModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add selected teams to project');
    } finally {
      setIsAddingSelected(false);
    }
  };

  const handleAddSingleWorkspaceTeam = async (wt: any) => {
    try {
      await api.post(`/projects/${projectId}/teams`, {
        name: wt.name,
        key: wt.key || wt.name.slice(0, 3).toUpperCase(),
        color: wt.color || '#2563EB',
        description: wt.description || '',
        leadId: wt.leadId?._id || wt.leadId || ''
      });
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['workspace-teams'] });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to add team to project');
    }
  };

  return (
    <div className="flex flex-col gap-6 text-[#111827] max-w-7xl mx-auto select-none animate-fade-in">
      {/* Top Project Milestone & Team Control Banner */}
      <div className="bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] p-6 rounded-2xl text-white relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#22C55E]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs text-white shadow-xs"
                style={{ backgroundColor: project.color || '#0F172A' }}
              >
                {project.key?.charAt(0) || 'P'}
              </div>
              <h2 className="text-lg font-black tracking-tight">
                {project.name || 'Project'} • Teams & Progress Intelligence
              </h2>
              <span className="text-[10px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded text-white/90">
                [{project.key}]
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Real-time engineering progress broken down by specialized teams (Hardware PCB, Firmware, Software, QA, etc.).
            </p>
          </div>

          {canManageTeams && (
            <div className="flex items-center flex-wrap gap-2.5">
              {availableWorkspaceTeams.length > 0 && (
                <button
                  type="button"
                  disabled={isAddingAll}
                  onClick={handleAddAllWorkspaceTeams}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all border border-white/20 hover:border-emerald-400/50 shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Add all remaining workspace teams to this project"
                >
                  {isAddingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>Add All Org Teams ({availableWorkspaceTeams.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsAddTeamModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#22C55E] hover:bg-[#16A34A] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Team to Project</span>
              </button>
            </div>
          )}
        </div>

        {/* Overall Project Progress Bar in Banner */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-slate-300 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#22C55E]" />
                Overall Project Milestone Progress
              </span>
              <span className="text-[#22C55E] font-mono text-sm">
                {overview.overallCompletionPercent || 0}% Complete
              </span>
            </div>
            <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#22C55E] to-[#10B981] rounded-full transition-all duration-700"
                style={{ width: `${overview.overallCompletionPercent || 0}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-300 shrink-0">
            <div>
              <span className="text-slate-400 text-xs uppercase block font-bold">Total Tasks</span>
              <span className="text-white font-extrabold text-sm">{overview.totalTasks || 0}</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <span className="text-slate-400 text-xs uppercase block font-bold">Completed</span>
              <span className="text-[#22C55E] font-extrabold text-sm">{overview.completedTasks || 0}</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <span className="text-slate-400 text-xs uppercase block font-bold">In Progress</span>
              <span className="text-amber-400 font-extrabold text-sm">{overview.inProgressTasks || 0}</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <span className="text-slate-400 text-xs uppercase block font-bold">Teams</span>
              <span className="text-white font-extrabold text-sm">{overview.totalTeams || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State / Quick Setup for Teams */}
      {teams.length === 0 && (
        <div className="flex flex-col gap-6">
          {/* 1. Existing Workspace Teams if available */}
          {canManageTeams && availableWorkspaceTeams.length > 0 && (
            <div className="bg-white rounded-2xl border border-emerald-200/90 p-6 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-base">
                  <Building className="w-5 h-5 text-emerald-600" />
                  <span>Existing Organization Teams Available</span>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  {availableWorkspaceTeams.length} Team(s) in Workspace
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                The following specialized teams already exist in your workspace. Click to add them directly to <strong>{project.name || 'this project'}</strong>:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {availableWorkspaceTeams.map((wt: any) => (
                  <div
                    key={wt._id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50/40 hover:border-emerald-300 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: wt.color || '#2563EB' }}
                          />
                          <h4 className="text-sm font-bold text-slate-900">{wt.name}</h4>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                          [{wt.key}]
                        </span>
                      </div>
                      {wt.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                          {wt.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-500">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{(wt.members || []).length} member(s)</span>
                        {wt.leadId?.name && (
                          <span className="text-emerald-700 font-semibold">• Lead: {wt.leadId.name}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={createTeamMutation.isPending}
                      onClick={() => {
                        createTeamMutation.mutate({
                          name: wt.name,
                          key: wt.key || wt.name.slice(0, 3).toUpperCase(),
                          color: wt.color || '#2563EB',
                          description: wt.description || '',
                          leadId: wt.leadId?._id || wt.leadId || ''
                        });
                      }}
                      className="mt-3.5 w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add to This Project</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Quick Setup Presets */}
          {canManageTeams ? (
            <div className="bg-white rounded-2xl border border-blue-200/80 p-6 shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-base">
                  <Zap className="w-4.5 h-4.5 text-blue-600" />
                  <span>Quick Setup: Common Engineering Teams for {project.name || 'this project'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddTeamModalOpen(true)}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Team</span>
                </button>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Click any team preset below to instantly add it to this project, or use the "+ Create Team" button above.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {presetTeams.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    disabled={createTeamMutation.isPending}
                    onClick={() => handleQuickAddPreset(preset)}
                    className="p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left group flex flex-col justify-between cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span className="text-xs font-mono font-bold bg-gray-100 group-hover:bg-blue-100 text-gray-700 group-hover:text-blue-700 px-2 py-0.5 rounded">
                          [{preset.key}]
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-700">
                        {preset.name}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1 leading-snug">
                        {preset.desc}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-xs font-bold text-blue-600">
                      <span>+ Add to Project</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-xs text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-gray-900">No Specialized Teams Added Yet</h4>
              <p className="text-xs text-gray-500 max-w-md mt-1">
                No discipline teams have been assigned to this project yet. A Project Manager or Admin can add teams to start tracking velocity.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Quick Add Available Workspace Teams Bar (when project has teams and more are available) */}
      {teams.length > 0 && canManageTeams && availableWorkspaceTeams.length > 0 && (
        <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Building className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-900">
                  Remaining Organization Teams ({availableWorkspaceTeams.length})
                </span>
                <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Click to add to this project
                </span>
              </div>
              <p className="text-[11px] text-emerald-700 font-medium">
                Add other workspace teams to collaborate on {project.name || 'this project'}.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {availableWorkspaceTeams.map((wt: any) => (
              <button
                key={wt._id}
                type="button"
                disabled={createTeamMutation.isPending || isAddingAll}
                onClick={() => {
                  createTeamMutation.mutate({
                    name: wt.name,
                    key: wt.key || wt.name.slice(0, 3).toUpperCase(),
                    color: wt.color || '#2563EB',
                    description: wt.description || '',
                    leadId: wt.leadId?._id || wt.leadId || ''
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-600 hover:text-white text-slate-800 text-xs font-bold rounded-lg border border-emerald-300 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                title={`Add ${wt.name} to this project`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: wt.color || '#2563EB' }}
                />
                <span>+ {wt.name}</span>
                <span className="text-[10px] opacity-70 font-mono">[{wt.key}]</span>
              </button>
            ))}

            {availableWorkspaceTeams.length > 1 && (
              <button
                type="button"
                disabled={isAddingAll}
                onClick={handleAddAllWorkspaceTeams}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isAddingAll ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                <span>Add All ({availableWorkspaceTeams.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team: any) => (
          <div
            key={team._id}
            className="bg-white rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5 truncate">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: team.color || '#3B82F6' }}
                  />
                  <h4 className="text-base font-bold text-gray-900 truncate">{team.name}</h4>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs font-mono font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    [{team.key}]
                  </span>
                  {canManageTeams && (
                    <button
                      type="button"
                      disabled={deleteTeamMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove team "${team.name}" from ${project.name || 'this project'}? (This team will still remain in your workspace)`)) {
                          deleteTeamMutation.mutate(team._id);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title={`Remove ${team.name} from this project`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {team.description && (
                <p className="text-xs text-slate-500 font-medium mb-3 line-clamp-2">
                  {team.description}
                </p>
              )}

              {/* Completion Progress Bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
                  <span className="text-gray-600">Discipline Progress</span>
                  <span className="text-[#0F172A] font-extrabold">{team.completionPercent}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${team.completionPercent}%`,
                      backgroundColor: team.color || '#3B82F6'
                    }}
                  />
                </div>
              </div>

              {/* Team Stats */}
              <div className="grid grid-cols-4 gap-2 text-center p-2.5 bg-slate-50 rounded-xl mb-3">
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase block">Total</span>
                  <span className="text-sm font-extrabold text-gray-800">{team.totalTasks}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-amber-500 uppercase block">WIP</span>
                  <span className="text-sm font-extrabold text-amber-600">{team.inProgressTasks}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-[#22C55E] uppercase block">Done</span>
                  <span className="text-sm font-extrabold text-[#22C55E]">{team.completedTasks}</span>
                </div>
                <div>
                  <span className="text-xs font-bold text-rose-500 uppercase block">Alerts</span>
                  <span className="text-sm font-extrabold text-rose-600">{team.overdueTasks}</span>
                </div>
              </div>

              {/* Team Lead & Members */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-100 font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400">Lead:</span>
                  <span className="font-bold text-gray-800">
                    {team.lead?.name || 'Unassigned'}
                  </span>
                </div>

                <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                  {team.completedTasks || 0}/{team.totalTasks || 0} Issues Done
                </span>
              </div>
            </div>

            {/* Recent Task list preview */}
            {team.recentTasks && team.recentTasks.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Recent Work Items:
                </span>
                <div className="space-y-1">
                  {team.recentTasks.slice(0, 3).map((task: any) => (
                    <button
                      key={task._id}
                      onClick={() => onSelectTask && onSelectTask(task)}
                      className="w-full text-left flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 text-xs transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono text-xs font-bold text-gray-400 group-hover:text-blue-600">
                          [{task.key}]
                        </span>
                        <span className="truncate font-semibold text-gray-700 group-hover:text-blue-600">
                          {task.title}
                        </span>
                      </div>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded shrink-0 border"
                        style={{
                          backgroundColor: task.status === 'DONE' ? '#DCFCE7' : task.status === 'IN_PROGRESS' ? '#FEF3C7' : '#F3F4F6',
                          color: task.status === 'DONE' ? '#16A34A' : task.status === 'IN_PROGRESS' ? '#D97706' : '#4B5563',
                          borderColor: task.status === 'DONE' ? '#BBF7D0' : task.status === 'IN_PROGRESS' ? '#FDE68A' : '#E5E7EB'
                        }}
                      >
                        {task.status}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add / Create Team Centered Modal */}
      {canManageTeams && isAddTeamModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-[#111827] w-full max-w-xl max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[#22C55E]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Add Teams to Project</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Select from existing workspace teams to add them to {project.name || 'this project'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddTeamModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs: Existing Teams vs Create Custom */}
            <div className="flex items-center border-b border-slate-200 bg-slate-50 px-6 pt-2 shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setModalTab('fetch')}
                className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  modalTab === 'fetch'
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Existing Workspace Teams ({availableWorkspaceTeams.length} available)</span>
              </button>
              <button
                type="button"
                onClick={() => setModalTab('create')}
                className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  modalTab === 'create'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Create New Custom Team</span>
              </button>
            </div>

            {modalTab === 'fetch' ? (
              <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                {/* Controls Bar */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-600">
                    {workspaceTeams.length} total team(s) in organization
                  </span>
                  {availableWorkspaceTeams.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedWorkspaceTeamIds(availableWorkspaceTeams.map((t: any) => t._id))
                        }
                        className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Select All Available ({availableWorkspaceTeams.length})
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedWorkspaceTeamIds([])}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  )}
                </div>

                {/* Loading state */}
                {isLoadingWorkspaceTeams && (
                  <div className="p-8 flex items-center justify-center gap-2 text-slate-500 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Fetching workspace teams...</span>
                  </div>
                )}

                {/* Empty State */}
                {!isLoadingWorkspaceTeams && workspaceTeams.length === 0 && (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <p className="text-xs text-slate-600 font-semibold mb-3">
                      No teams have been created in this organization workspace yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => setModalTab('create')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create Your First Team</span>
                    </button>
                  </div>
                )}

                {/* Fetched Teams List */}
                <div className="flex flex-col gap-2.5">
                  {(workspaceTeams as any[]).map((wt: any) => {
                    const isAlreadyInProject = existingProjectTeamNames.has(wt.name?.toLowerCase().trim());
                    const isSelected = selectedWorkspaceTeamIds.includes(wt._id);

                    return (
                      <div
                        key={wt._id}
                        onClick={() => {
                          if (isAlreadyInProject) return;
                          setSelectedWorkspaceTeamIds((prev) =>
                            prev.includes(wt._id) ? prev.filter((id) => id !== wt._id) : [...prev, wt._id]
                          );
                        }}
                        className={`p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isAlreadyInProject
                            ? 'bg-slate-50/80 border-slate-200 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-emerald-50/70 border-emerald-500 shadow-2xs cursor-pointer ring-1 ring-emerald-500/30'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Checkbox */}
                          <div
                            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${
                              isAlreadyInProject
                                ? 'bg-slate-200 text-slate-500'
                                : isSelected
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'border border-slate-300 bg-white'
                            }`}
                          >
                            {(isAlreadyInProject || isSelected) && <Check className="w-3.5 h-3.5" />}
                          </div>

                          {/* Color & Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: wt.color || '#2563EB' }}
                              />
                              <span className="text-xs font-extrabold text-slate-900">{wt.name}</span>
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                [{wt.key}]
                              </span>
                            </div>
                            {wt.description && (
                              <p className="text-[11px] text-slate-500 truncate mt-0.5 max-w-md">
                                {wt.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                              <span>{(wt.members || []).length} member(s)</span>
                              {wt.leadId?.name && (
                                <span className="text-emerald-700 font-semibold">• Lead: {wt.leadId.name}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right Side Status / Instant Add */}
                        <div className="shrink-0">
                          {isAlreadyInProject ? (
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-1 rounded-md">
                              Already in Project
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={createTeamMutation.isPending || isAddingSelected}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddSingleWorkspaceTeam(wt);
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-emerald-600 hover:text-white border border-emerald-300 text-emerald-700 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                              title={`Add ${wt.name} right now`}
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer for Fetch Tab */}
                <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                  <span className="text-xs font-semibold text-slate-600">
                    {selectedWorkspaceTeamIds.length} team(s) selected
                  </span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setIsAddTeamModalOpen(false)}
                      className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={selectedWorkspaceTeamIds.length === 0 || isAddingSelected}
                      onClick={handleAddSelectedTeams}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      {isAddingSelected ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Adding Teams...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Add Selected Teams ({selectedWorkspaceTeamIds.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Create Custom Team Form */
              <form onSubmit={handleCreateTeamSubmit} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-1.5">
                    Team Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hardware & PCB, Firmware, Software"
                    value={newTeamName}
                    onChange={(e) => {
                      setNewTeamName(e.target.value);
                      if (!newTeamKey) {
                        setNewTeamKey(e.target.value.slice(0, 3).toUpperCase());
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-1.5">
                      Team Key Tag
                    </label>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="e.g. HW, SW"
                      value={newTeamKey}
                      onChange={(e) => setNewTeamKey(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 text-slate-800 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-900 mb-1.5">
                      Color Badge
                    </label>
                    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <input
                        type="color"
                        value={newTeamColor}
                        onChange={(e) => setNewTeamColor(e.target.value)}
                        className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                      />
                      <span className="font-mono text-xs font-bold text-gray-700">{newTeamColor}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-900">
                      Assigned Team Lead
                    </label>
                    <span className="text-[10px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold">
                      {teamLeadCandidates.length > 0 ? `${teamLeadCandidates.length} Lead(s) available` : 'All members'}
                    </span>
                  </div>
                  <select
                    value={newTeamLeadId}
                    onChange={(e) => setNewTeamLeadId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 cursor-pointer transition-all"
                  >
                    <option value="">Select Team Lead (Optional)</option>
                    {availableTeamLeads.map((m: any) => {
                      const id = (typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id);
                      const name = m.name || (typeof m.userId === 'object' && m.userId?.name) || (m.email ? m.email.split('@')[0] : 'Member');
                      const email = m.email || (typeof m.userId === 'object' && m.userId?.email) || '';
                      const role = m.role || (typeof m.userId === 'object' && m.userId?.role) || m.jobTitle || 'TEAM_LEAD';
                      const roleLabel = role ? ` • [${formatRole(role)}]` : '';
                      return (
                        <option key={id} value={id}>
                          {name} {email && email !== name ? `(${email})` : ''}{roleLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-900 mb-1.5">
                    Description / Responsibilities
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Responsible for PCB schematics, board bring-up, and manufacturing..."
                    value={newTeamDescription}
                    onChange={(e) => setNewTeamDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 transition-all resize-none"
                  />
                </div>

                {/* Modal Footer */}
                <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAddTeamModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTeamMutation.isPending || !newTeamName.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-extrabold rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    {createTeamMutation.isPending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Creating Team...</span>
                      </>
                    ) : (
                      <span>Create Team</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
