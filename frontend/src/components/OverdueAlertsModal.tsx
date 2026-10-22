'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  AlertTriangle,
  Search,
  FolderKanban,
  Zap,
  Users,
  User,
  Clock,
  Bug,
  BookOpen,
  CheckCircle2,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export interface OverdueTaskItem {
  _id: string;
  key?: string;
  title: string;
  status: string;
  priority: string;
  issueType?: string;
  dueDate?: string | Date;
  createdAt?: string | Date;
  team?: string;
  teamLead?: {
    _id?: string;
    name?: string;
    email?: string;
    avatar?: string;
  } | null;
  project?: {
    _id?: string;
    name?: string;
    key?: string;
    color?: string;
    lead?: {
      _id?: string;
      name?: string;
      email?: string;
      avatar?: string;
    } | null;
  } | null;
  projectLead?: {
    _id?: string;
    name?: string;
    email?: string;
    avatar?: string;
  } | null;
  sprint?: string;
  sprintDetail?: {
    _id?: string;
    name?: string;
    status?: string;
    startDate?: string | Date;
    endDate?: string | Date;
  } | null;
  assigneeId?: {
    _id?: string;
    name?: string;
    email?: string;
    avatar?: string;
  } | null;
  [key: string]: any;
}

interface OverdueAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: OverdueTaskItem[];
  onSelectTask?: (task: any) => void;
  currentUserId?: string;
  initialScope?: 'ALL' | 'MINE';
}

export const OverdueAlertsModal: React.FC<OverdueAlertsModalProps> = ({
  isOpen,
  onClose,
  tasks,
  onSelectTask,
  currentUserId,
  initialScope = 'ALL'
}) => {
  const [mounted, setMounted] = useState(false);
  const [scope, setScope] = useState<'ALL' | 'MINE'>(initialScope);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('ALL');
  const [selectedTeam, setSelectedTeam] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync initialScope whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setScope(initialScope);
      setSearchQuery('');
      setSelectedProject('ALL');
      setSelectedTeam('ALL');
      setSelectedPriority('ALL');
    }
  }, [isOpen, initialScope]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute Days Overdue helper
  const getDaysOverdue = (dueDate?: string | Date) => {
    if (!dueDate) return 0;
    const diffMs = Date.now() - new Date(dueDate).getTime();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  };

  // User initials helper
  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  // Count assigned to me
  const myTasksCount = useMemo(() => {
    if (!currentUserId) return 0;
    return tasks.filter((t) => {
      const aId = (t.assigneeId?._id || t.assigneeId)?.toString();
      return aId === currentUserId?.toString();
    }).length;
  }, [tasks, currentUserId]);

  // Filter tasks based on Scope (All vs Mine)
  const scopeTasks = useMemo(() => {
    if (scope === 'MINE' && currentUserId) {
      return tasks.filter((t) => {
        const aId = (t.assigneeId?._id || t.assigneeId)?.toString();
        return aId === currentUserId?.toString();
      });
    }
    return tasks;
  }, [tasks, scope, currentUserId]);

  // Extract distinct filters
  const projectOptions = useMemo(() => {
    const set = new Map<string, string>();
    scopeTasks.forEach((t) => {
      const pId = t.project?._id || t.projectId?._id || t.projectId;
      const pName = t.project?.name || t.projectId?.name;
      if (pId && pName) set.set(pId.toString(), pName);
    });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [scopeTasks]);

  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    scopeTasks.forEach((t) => {
      if (t.team && t.team.trim()) set.add(t.team.trim());
    });
    return Array.from(set);
  }, [scopeTasks]);

  // Filtered task items
  const filteredTasks = useMemo(() => {
    return scopeTasks.filter((t) => {
      // Project filter
      if (selectedProject !== 'ALL') {
        const pId = (t.project?._id || t.projectId?._id || t.projectId)?.toString();
        if (pId !== selectedProject) return false;
      }
      // Team filter
      if (selectedTeam !== 'ALL') {
        if ((t.team || '').trim().toLowerCase() !== selectedTeam.toLowerCase()) return false;
      }
      // Priority filter
      if (selectedPriority !== 'ALL') {
        if ((t.priority || 'MEDIUM').toUpperCase() !== selectedPriority) return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesKey = t.key?.toLowerCase().includes(q);
        const matchesTitle = t.title?.toLowerCase().includes(q);
        const matchesProject = (t.project?.name || t.projectId?.name)?.toLowerCase().includes(q);
        const matchesTeam = t.team?.toLowerCase().includes(q);
        const matchesSprint = (t.sprint || t.sprintDetail?.name)?.toLowerCase().includes(q);
        const matchesAssignee = t.assigneeId?.name?.toLowerCase().includes(q);
        const matchesProjectLead = (t.projectLead?.name || t.project?.lead?.name)?.toLowerCase().includes(q);
        const matchesTeamLead = t.teamLead?.name?.toLowerCase().includes(q);

        return (
          matchesKey ||
          matchesTitle ||
          matchesProject ||
          matchesTeam ||
          matchesSprint ||
          matchesAssignee ||
          matchesProjectLead ||
          matchesTeamLead
        );
      }
      return true;
    });
  }, [scopeTasks, selectedProject, selectedTeam, selectedPriority, searchQuery]);

  // Quick statistics
  const stats = useMemo(() => {
    const total = scopeTasks.length;
    const urgentOrHigh = scopeTasks.filter((t) => {
      const p = (t.priority || '').toUpperCase();
      return p === 'URGENT' || p === 'HIGH';
    }).length;

    const impactedProjects = new Set(
      scopeTasks.map((t) => (t.project?._id || t.projectId?._id || t.projectId)?.toString()).filter(Boolean)
    ).size;

    const impactedTeams = new Set(
      scopeTasks.map((t) => (t.team || '').trim()).filter(Boolean)
    ).size;

    return { total, urgentOrHigh, impactedProjects, impactedTeams };
  }, [scopeTasks]);

  // Priority color badge helper
  const getPriorityBadgeClass = (priority?: string) => {
    switch ((priority || '').toUpperCase()) {
      case 'URGENT':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'LOW':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  // Status badge helper
  const getStatusBadge = (status?: string) => {
    switch ((status || '').toUpperCase()) {
      case 'IN_PROGRESS':
        return { label: 'In Progress', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'IN_REVIEW':
        return { label: 'In Review', bg: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'BACKLOG':
        return { label: 'Backlog', bg: 'bg-gray-50 text-gray-700 border-gray-200' };
      default:
        return { label: 'To Do', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  // Issue Type icon helper
  const getTypeInfo = (issueType?: string) => {
    switch ((issueType || '').toUpperCase()) {
      case 'BUG':
        return { icon: Bug, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200', label: 'Bug' };
      case 'STORY':
        return { icon: BookOpen, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', label: 'Story' };
      default:
        return { icon: CheckCircle2, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Task' };
    }
  };

  if (!isOpen || !mounted) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-[#0F172A]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-[#111827] w-full max-w-5xl max-h-[88vh] animate-slide-up my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================================= */}
        {/* Top Header Bar                                                            */}
        {/* ========================================================================= */}
        <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between bg-[#F3F4F6]/80 shrink-0 gap-3 select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 text-rose-600 flex items-center justify-center shadow-2xs shrink-0">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-[#111827]">Overdue Tasks & Alerts</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  {scopeTasks.length} {scopeTasks.length === 1 ? 'task' : 'tasks'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Action Required
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {scope === 'MINE'
                  ? 'Your overdue tasks past deadline requiring immediate attention.'
                  : 'Tasks past their deadline with space, sprint, team, lead, and assignee details.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-center">
            {/* Scope Filter Switch (Assigned to Me vs All Workspace) */}
            {currentUserId && (
              <div className="flex items-center bg-gray-200/80 p-0.5 rounded-xl border border-gray-300/60 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setScope('MINE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    scope === 'MINE'
                      ? 'bg-white text-rose-600 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Assigned to Me ({myTasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setScope('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    scope === 'ALL'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All Workspace ({tasks.length})
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-[#111827] hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Quick Stat Bar                                                            */}
        {/* ========================================================================= */}
        <div className="px-6 py-2.5 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-600 shrink-0 select-none">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-rose-500" />
            <span>Total Overdue:</span>
            <strong className="text-rose-600 font-bold">{stats.total}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
            <span>Urgent / High:</span>
            <strong className="text-orange-600 font-bold">{stats.urgentOrHigh}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5 text-blue-500" />
            <span>Spaces Impacted:</span>
            <strong className="text-[#111827] font-bold">{stats.impactedProjects}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-purple-500" />
            <span>Teams Affected:</span>
            <strong className="text-[#111827] font-bold">{stats.impactedTeams}</strong>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Filter and Search Bar                                                     */}
        {/* ========================================================================= */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          {/* Search box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search key, title, space, sprint, team, lead, person..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-[#111827] placeholder-gray-400 font-medium"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Project Filter */}
            {projectOptions.length > 1 && (
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 text-gray-700 font-bold px-2.5 py-1.5 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="ALL">All Spaces</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            {/* Team Filter */}
            {teamOptions.length > 0 && (
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 text-gray-700 font-bold px-2.5 py-1.5 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                <option value="ALL">All Teams</option>
                {teamOptions.map((tm) => (
                  <option key={tm} value={tm}>
                    {tm}
                  </option>
                ))}
              </select>
            )}

            {/* Priority Filter */}
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="text-xs bg-gray-50 border border-gray-200 text-gray-700 font-bold px-2.5 py-1.5 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="URGENT">Urgent Only</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Scrollable Tasks List                                                     */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F8FAFC]">
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mb-2 shadow-2xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#111827]">No Overdue Tasks Found</h3>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                {searchQuery || selectedProject !== 'ALL' || selectedTeam !== 'ALL' || selectedPriority !== 'ALL'
                  ? 'No overdue tasks match the selected filter criteria.'
                  : 'All deadlines are on track! No active tasks are currently past their due date.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTasks.map((task) => {
                const daysOver = getDaysOverdue(task.dueDate);
                const typeInfo = getTypeInfo(task.issueType);
                const TypeIcon = typeInfo.icon;
                const statusBadge = getStatusBadge(task.status);
                const projectLead = task.projectLead || task.project?.lead;
                const teamLead = task.teamLead;
                const assignee = task.assigneeId;

                return (
                  <div
                    key={task._id}
                    onClick={() => {
                      if (onSelectTask) {
                        onSelectTask(task);
                        onClose();
                      }
                    }}
                    className="bg-white border border-gray-200 hover:border-blue-400 rounded-xl p-4 shadow-2xs hover:shadow-md transition-all cursor-pointer group flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    {/* Left: Task Identity & Title */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg ${typeInfo.bg} ${typeInfo.color} flex items-center justify-center shrink-0 mt-0.5 border shadow-3xs`}
                        title={typeInfo.label}
                      >
                        <TypeIcon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {/* Task Monospace Key */}
                          <span className="font-mono text-xs font-bold text-[#111827] bg-white px-2 py-0.5 rounded border border-gray-200 shadow-3xs">
                            {task.key || 'TASK'}
                          </span>

                          {/* Priority Pill */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getPriorityBadgeClass(
                              task.priority
                            )}`}
                          >
                            {(task.priority || 'MEDIUM').toUpperCase()}
                          </span>

                          {/* Status Pill */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBadge.bg}`}
                          >
                            {statusBadge.label}
                          </span>

                          {/* Days Overdue Countdown */}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-rose-600" />
                            <span>{daysOver} {daysOver === 1 ? 'day' : 'days'} overdue</span>
                          </span>
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-bold text-[#111827] group-hover:text-blue-600 transition-colors truncate">
                          {task.title}
                        </h4>

                        {/* Deadline note */}
                        <div className="text-[11px] text-gray-500 mt-1">
                          Due Date:{' '}
                          <span className="font-bold text-rose-600">
                            {task.dueDate
                              ? new Date(task.dueDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'No date set'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Details Grid (Project, Sprint, Team, Assignee) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 px-3 bg-gray-50/80 rounded-lg border border-gray-100 text-xs shrink-0 lg:max-w-xl w-full lg:w-auto">
                      {/* Space & Project Lead */}
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                          <FolderKanban className="w-3 h-3 text-blue-500" />
                          <span>Space & Lead</span>
                        </span>
                        <span className="font-bold text-[#111827] truncate" title={task.project?.name || 'Space'}>
                          {task.project?.name || 'Authorized Space'}
                        </span>
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-600 truncate">
                          {projectLead?.avatar ? (
                            <img
                              src={projectLead.avatar}
                              alt={projectLead.name}
                              className="w-4 h-4 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[8px] flex items-center justify-center shrink-0">
                              {getInitials(projectLead?.name)}
                            </div>
                          )}
                          <span className="truncate">{projectLead?.name || 'Space Lead'}</span>
                        </div>
                      </div>

                      {/* Sprint */}
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                          <Zap className="w-3 h-3 text-amber-500" />
                          <span>Sprint</span>
                        </span>
                        <span className="font-bold text-[#111827] truncate">
                          {task.sprint || task.sprintDetail?.name || 'Sprint 1'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium mt-1">
                          {task.sprintDetail?.status || 'Active'}
                        </span>
                      </div>

                      {/* Team & Team Lead */}
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                          <Users className="w-3 h-3 text-purple-500" />
                          <span>Team & Lead</span>
                        </span>
                        <span className="font-bold text-[#111827] truncate" title={task.team || 'Team'}>
                          {task.team || 'Engineering'}
                        </span>
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-600 truncate">
                          {teamLead?.avatar ? (
                            <img
                              src={teamLead.avatar}
                              alt={teamLead.name}
                              className="w-4 h-4 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-purple-100 text-purple-700 font-bold text-[8px] flex items-center justify-center shrink-0">
                              {getInitials(teamLead?.name || 'TL')}
                            </div>
                          )}
                          <span className="truncate">{teamLead?.name || 'Team Lead'}</span>
                        </div>
                      </div>

                      {/* Assignee */}
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                          <User className="w-3 h-3 text-emerald-500" />
                          <span>Assigned To</span>
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {assignee?.avatar ? (
                            <img
                              src={assignee.avatar}
                              alt={assignee.name}
                              className="w-4 h-4 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-gray-200 text-gray-700 font-bold text-[8px] flex items-center justify-center shrink-0">
                              {getInitials(assignee?.name)}
                            </div>
                          )}
                          <span className="font-bold text-[#111827] truncate">
                            {assignee?.name || 'Unassigned'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 truncate mt-0.5">
                          {assignee?.email || 'No email'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Open Button */}
                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                      <button
                        type="button"
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 group-hover:bg-blue-600 text-blue-700 group-hover:text-white rounded-lg text-xs font-bold transition-all shadow-3xs cursor-pointer"
                      >
                        <span>Open Task</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* Footer                                                                    */}
        {/* ========================================================================= */}
        <div className="px-6 py-3 border-t border-gray-200 bg-[#F3F4F6]/60 flex items-center justify-between text-xs text-gray-500 font-medium shrink-0 select-none">
          <div>
            Showing <strong className="text-[#111827] font-bold">{filteredTasks.length}</strong> of{' '}
            <strong className="text-[#111827] font-bold">{scopeTasks.length}</strong> overdue items.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-gray-50 text-gray-700 font-bold rounded-lg border border-gray-200 shadow-2xs transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
