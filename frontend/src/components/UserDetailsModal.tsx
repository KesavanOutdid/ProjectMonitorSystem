'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import {
  X,
  Loader2,
  Users,
  FolderKanban,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  Calendar,
  Building,
  Mail,
  Shield,
  Plus,
  Trash2,
  ExternalLink,
  Crown,
  UserCheck,
  Check,
  Briefcase,
  Layers
} from 'lucide-react';

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  workspaceId: string;
}

export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  isOpen,
  onClose,
  userId,
  workspaceId
}) => {
  const queryClient = useQueryClient();
  const [selectedProjectIdToAssign, setSelectedProjectIdToAssign] = useState('');
  const [assignRole, setAssignRole] = useState('MEMBER');
  const [assignSuccessMsg, setAssignSuccessMsg] = useState('');

  // Fetch in-depth user details
  const {
    data: details,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['admin-user-details', userId, workspaceId],
    queryFn: async () => {
      if (!userId || !workspaceId) return null;
      const res = await api.get(`/admin/users/${userId}/details?workspaceId=${workspaceId}`);
      return res.data?.data;
    },
    enabled: isOpen && !!userId && !!workspaceId
  });

  // Fetch all workspace projects for assignment dropdown
  const { data: allProjects = [] } = useQuery({
    queryKey: ['admin-all-projects-dropdown', workspaceId],
    queryFn: async () => {
      const res = await api.get(`/projects?workspaceId=${workspaceId}`);
      return res.data?.data || [];
    },
    enabled: isOpen && !!workspaceId
  });

  // Mutation: Assign user to project
  const assignProjectMutation = useMutation({
    mutationFn: async ({ projectId, role }: { projectId: string; role: string }) => {
      const res = await api.post(`/projects/${projectId}/members`, {
        userId,
        role
      });
      return res.data;
    },
    onSuccess: () => {
      setAssignSuccessMsg('User successfully assigned to project!');
      setSelectedProjectIdToAssign('');
      setTimeout(() => setAssignSuccessMsg(''), 3000);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    }
  });

  // Mutation: Remove user from project
  const removeProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await api.delete(`/projects/${projectId}/members/${userId}`);
      return res.data;
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    }
  });

  if (!isOpen || !userId) return null;

  // Filter projects user is NOT yet assigned to
  const assignedProjectIds = new Set((details?.assignedProjects || []).map((p: any) => p._id));
  const availableProjectsToAssign = allProjects.filter((p: any) => !assignedProjectIds.has(p._id));

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white flex items-center justify-center font-black text-base shadow-sm ring-2 ring-slate-200">
              {details?.user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                  {details?.user?.name || 'User Work Profile'}
                </h3>
                {details?.user?.status && (
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                      details.user.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      details.user.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`} />
                    {details.user.status}
                  </span>
                )}
                {details?.user?.role && (
                  <span className="text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    {details.user.role.replace('_', ' ')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {details?.user?.email}
                </span>
                {details?.user?.department && (
                  <span className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    {details.user.department}
                  </span>
                )}
                {details?.user?.jobTitle && (
                  <span className="flex items-center gap-1.5 text-slate-600 font-semibold">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    {details.user.jobTitle}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="text-sm font-semibold">Loading user workload & teams audit...</span>
            </div>
          ) : !details ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              Unable to load user details. Please try again.
            </div>
          ) : (
            <>
              {/* 1. TOP 4 METRICS SUMMARY CARDS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* Total Tasks Assigned */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Assigned Tasks</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="mt-2.5">
                    <div className="text-2xl font-black text-slate-900">
                      {details.taskMetrics.totalTasks}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center justify-between">
                      <span>{details.taskMetrics.completedCount} completed</span>
                      <span className="font-bold text-blue-600">
                        {details.taskMetrics.completionRate}%
                      </span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${details.taskMetrics.completionRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* In Progress / Active */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Active Work</span>
                    <Clock className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2.5">
                    <div className="text-2xl font-black text-slate-900">
                      {details.taskMetrics.inProgressCount}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-1">
                      <span>{details.taskMetrics.inReviewCount} in review · {details.taskMetrics.todoCount} todo</span>
                    </div>
                  </div>
                </div>

                {/* Overdue Tasks */}
                <div
                  className={`border rounded-xl p-4 flex flex-col justify-between shadow-2xs transition-colors ${
                    details.taskMetrics.overdueCount > 0
                      ? 'bg-rose-50/80 border-rose-300 text-rose-900'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider">
                      {details.taskMetrics.overdueCount > 0 ? 'Overdue Tasks' : 'Deadlines Status'}
                    </span>
                    {details.taskMetrics.overdueCount > 0 ? (
                      <Flame className="w-4 h-4 text-rose-600 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <div className="mt-2.5">
                    <div
                      className={`text-2xl font-black ${
                        details.taskMetrics.overdueCount > 0 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {details.taskMetrics.overdueCount}
                    </div>
                    <div className="text-[11px] font-semibold mt-1">
                      {details.taskMetrics.overdueCount > 0 ? (
                        <span className="text-rose-700 font-bold">Needs attention</span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">All deadlines on track</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scope: Teams & Projects */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Work Scope</span>
                    <FolderKanban className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="mt-2.5">
                    <div className="text-2xl font-black text-slate-900">
                      {details.assignedProjects.length}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium mt-1">
                      <span>Projects ({details.teams.length} teams)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. OVERDUE TASKS BANNER (Only renders if user actually has overdue tasks) */}
              {details.overdueTasks && details.overdueTasks.length > 0 && (
                <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-rose-900">
                        Overdue Tasks Warning ({details.overdueTasks.length})
                      </h4>
                      <p className="text-xs text-rose-700">
                        These assigned tasks have passed their scheduled delivery due dates.
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-rose-200/70 border border-rose-200 bg-white rounded-lg overflow-hidden">
                    {details.overdueTasks.map((ot: any) => (
                      <div
                        key={ot._id}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-rose-50/30 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-xs font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded shrink-0">
                            {ot.key}
                          </span>
                          <span className="text-sm font-bold text-slate-900 truncate">
                            {ot.title}
                          </span>
                          {ot.project && (
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                              {ot.project.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs shrink-0">
                          <span className="font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-full border border-rose-200">
                            {ot.daysOverdue} {ot.daysOverdue === 1 ? 'day' : 'days'} overdue
                          </span>
                          <span className="font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            Due: {new Date(ot.dueDate).toLocaleDateString()}
                          </span>
                          <span className="font-bold text-xs uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            {ot.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. SECTION: PROJECT ASSOCIATIONS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                      <FolderKanban className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Project Associations ({details.assignedProjects.length})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Active projects and member governance roles
                      </p>
                    </div>
                  </div>
                </div>

                {assignSuccessMsg && (
                  <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-lg flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>{assignSuccessMsg}</span>
                  </div>
                )}

                {/* Projects Card Grid */}
                {details.assignedProjects.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    User has Organization-wide access and is not restricted to specific projects.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    {details.assignedProjects.map((p: any) => (
                      <div
                        key={p._id}
                        className="flex items-center justify-between p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-8 h-8 rounded-lg text-white font-mono font-black text-xs flex items-center justify-center shrink-0 shadow-2xs"
                            style={{ backgroundColor: p.color || '#2563EB' }}
                          >
                            {p.key?.charAt(0) || 'P'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs font-bold text-slate-500">[{p.key}]</span>
                              <span className="font-bold text-sm text-slate-900 truncate">{p.name}</span>
                            </div>
                            <div className="mt-0.5">
                              {p.isLead || p.role === 'Project Lead' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-purple-700 bg-purple-100/80 px-2 py-0.5 rounded-md">
                                  <Crown className="w-3 h-3 text-purple-600" />
                                  Project Lead
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-600 bg-slate-200/80 px-2 py-0.5 rounded-md">
                                  {p.role || 'Member'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => removeProjectMutation.mutate(p._id)}
                          disabled={removeProjectMutation.isPending}
                          title="Remove user from project"
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick Assign to New Project */}
                {availableProjectsToAssign.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-2.5">
                    <span className="text-xs font-bold text-slate-600 shrink-0">
                      + Assign to Project:
                    </span>
                    <select
                      value={selectedProjectIdToAssign}
                      onChange={(e) => setSelectedProjectIdToAssign(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg px-3 py-1.5 outline-none flex-1 w-full sm:w-auto text-slate-800"
                    >
                      <option value="">Select project...</option>
                      {availableProjectsToAssign.map((p: any) => (
                        <option key={p._id} value={p._id}>
                          [{p.key}] {p.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none w-full sm:w-auto text-slate-800"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="PROJECT_MANAGER">Project Lead</option>
                    </select>

                    <button
                      disabled={!selectedProjectIdToAssign || assignProjectMutation.isPending}
                      onClick={() =>
                        assignProjectMutation.mutate({
                          projectId: selectedProjectIdToAssign,
                          role: assignRole
                        })
                      }
                      className="w-full sm:w-auto text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                    >
                      {assignProjectMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      <span>Add</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. SECTION: FUNCTIONAL TEAMS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Functional Teams ({details.teams.length})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Operational teams and functional leadership
                      </p>
                    </div>
                  </div>
                </div>

                {details.teams.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    User does not currently belong to any functional team.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {details.teams.map((team: any) => {
                      const contextLabel = team.department || team.type?.replace('Project: ', '') || 'Team';
                      return (
                        <div
                          key={team._id}
                          className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors flex flex-col justify-between"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold text-xs shrink-0 shadow-2xs"
                                style={{ backgroundColor: team.color || '#2563EB' }}
                              >
                                {team.key ? team.key.slice(0, 3) : 'TM'}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-slate-900 leading-tight truncate">
                                  {team.name}
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium truncate block mt-0.5">
                                  {contextLabel}
                                </span>
                              </div>
                            </div>

                            {team.isLead ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full shrink-0">
                                <Crown className="w-3 h-3 text-amber-600" />
                                Lead
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-full shrink-0">
                                Member
                              </span>
                            )}
                          </div>

                          <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-medium text-slate-600">{team.membersCount || 0} members</span>
                            <span className="font-mono text-[10px] text-slate-400 font-bold">{team.key}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 5. SECTION: RECENT ASSIGNED TASKS */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        Recent Assigned Tasks ({details.recentTasks.length})
                      </h4>
                      <p className="text-xs text-slate-500">
                        Active backlog & board items assigned to this user
                      </p>
                    </div>
                  </div>
                </div>

                {details.recentTasks.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No active tasks currently assigned to this user.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                    {details.recentTasks.map((t: any) => (
                      <div
                        key={t._id}
                        className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          <span className="font-mono text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded shrink-0">
                            {t.key}
                          </span>
                          <span className="font-bold text-slate-900 truncate">
                            {t.title}
                          </span>
                          {t.project && (
                            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                              {t.project.name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {t.isOverdue && (
                            <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                              Overdue
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              t.status === 'DONE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : t.status === 'IN_PROGRESS'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {t.status}
                          </span>
                          {t.dueDate && (
                            <span className="text-[11px] text-slate-500">
                              {new Date(t.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 font-medium">
            Project & Team Governance Audit
          </div>
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 px-5 py-2 rounded-xl transition-all cursor-pointer shadow-2xs"
          >
            Close Details
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
