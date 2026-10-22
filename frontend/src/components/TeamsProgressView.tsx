'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
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
  Filter
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
  const { user } = useAuthStore();
  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('ALL');
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
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

  // Delete Team Mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await api.delete(`/projects/${projectId}/teams/${teamId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
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

          {isOrgAdmin && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsAddTeamModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#22C55E] hover:bg-[#16A34A] text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Create Team</span>
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

      {/* Quick Setup Presets if no teams exist yet (Org Admin only) */}
      {teams.length === 0 && isOrgAdmin && (
        <div className="bg-white rounded-2xl border border-blue-200/80 p-6 shadow-xs flex flex-col gap-4">
          <div className="flex items-center gap-2 text-blue-900 font-bold text-base">
            <Zap className="w-4.5 h-4.5 text-blue-600" />
            <span>Quick Setup: Common Engineering Teams for {project.name}</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 font-medium">
            Click any team preset below to instantly add it to this project, or use the custom "+ Create Team" button above.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {presetTeams.map((preset) => (
              <button
                key={preset.key}
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
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: team.color || '#3B82F6' }}
                  />
                  <h4 className="text-base font-bold text-gray-900">{team.name}</h4>
                </div>
                <span className="text-xs font-mono font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                  [{team.key}]
                </span>
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

      {/* Add / Create Team Centered Modal (Org Admin only) */}
      {isOrgAdmin && isAddTeamModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-[#111827] w-full max-w-xl max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[#22C55E]">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Create New Specialized Team</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Configure team details & assign its Team Lead
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

            {/* Scrollable Form Body */}
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
                    const roleLabel = role ? ` • [${role.replace(/_/g, ' ')}]` : '';
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
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
