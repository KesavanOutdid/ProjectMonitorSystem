'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { getBackendUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { TimelineTree, TimeframeOption } from './TimelineTree';
import { OverdueAlertsModal } from './OverdueAlertsModal';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  Zap,
  Bug,
  BookOpen,
  Layers,
  Activity,
  UserCheck,
  Calendar,
  Sparkles,
  Check,
  Search,
  Filter,
  ArrowRight,
  RotateCcw,
  CalendarDays
} from 'lucide-react';

interface DashboardViewProps {
  onSelectProject?: (proj: any) => void;
  onSelectTask?: (task: any) => void;
  onNavigateTab?: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectProject,
  onSelectTask,
  onNavigateTab
}) => {
  const { user, currentWorkspace, projects, setCurrentProject } = useAuthStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeOption>('30d');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'organization' | 'personal'>('organization');
  const [myTaskFilter, setMyTaskFilter] = useState<'ALL' | 'IN_PROGRESS' | 'TODO' | 'DUE_SOON' | 'DONE'>('ALL');
  const [taskSearch, setTaskSearch] = useState('');
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [overdueModalScope, setOverdueModalScope] = useState<'ALL' | 'MINE'>('ALL');
  const [workTier, setWorkTier] = useState<'COMBINED' | 'MAIN' | 'SUBTASK' | 'MINI' | 'MICRO'>('COMBINED');

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['workspace-dashboard', currentWorkspace?._id, user?._id],
    queryFn: async () => {
      if (!currentWorkspace?._id) return null;
      const res = await api.get(`/workspaces/${currentWorkspace._id}/dashboard`);
      return res.data.data;
    },
    enabled: !!currentWorkspace?._id,
    refetchInterval: 30000
  });


  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isWorkspaceAdmin = ((currentWorkspace as any)?.ownerId === user?._id) || ((currentWorkspace as any)?.members?.some(
    (m: any) => (m.userId?._id === user?._id || m.userId === user?._id) && m.role === 'ORG_ADMIN'
  ));
  const isAdmin = isOrgAdmin || isWorkspaceAdmin;

  const displayedProjects = useMemo(() => {
    const list = dashboard?.projectHealth || [];
    return list.filter((p: any) => !p.isDeleted);
  }, [dashboard?.projectHealth]);

  const activeProject = selectedProjectId === 'ALL'
    ? null
    : displayedProjects.find((p: any) => p._id === selectedProjectId);

  const portfolioProjects = activeProject ? [activeProject] : displayedProjects;

  const ov = dashboard?.overview || {};
  const priorityBreakdown = dashboard?.priorityBreakdown || {};
  const typeBreakdown = dashboard?.typeBreakdown || {};
  const projectHealth = displayedProjects;
  const memberWorkload = dashboard?.memberWorkload || [];
  const creationTrend = dashboard?.creationTrend || [];
  const recentActivities = dashboard?.recentActivities || [];
  const workspaceTasks = dashboard?.tasks || [];
  const workspaceMembers = dashboard?.members || [];

  // Timeframe calculation helper
  const now = useMemo(() => new Date(), []);
  const timeframeBoundary = useMemo(() => {
    if (selectedTimeframe === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '1y') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return null;
  }, [selectedTimeframe, now]);

  // Reactive scoped tasks based on Timeframe, Project Scope & Member Filter
  const scopedTasks = useMemo(() => {
    return workspaceTasks.filter((t: any) => {
      // Timeframe filter
      if (timeframeBoundary) {
        const created = t.createdAt ? new Date(t.createdAt) : null;
        const updated = t.updatedAt ? new Date(t.updatedAt) : null;
        const due = t.dueDate ? new Date(t.dueDate) : null;
        const inRange =
          (created && created >= timeframeBoundary) ||
          (updated && updated >= timeframeBoundary) ||
          (due && due >= timeframeBoundary);
        if (!inRange) return false;
      }

      // Project filter
      if (selectedProjectId !== 'ALL') {
        const pId = (t.projectId?._id || t.projectId)?.toString();
        if (pId !== selectedProjectId) return false;
      }

      // Member filter
      if (selectedMemberId !== 'ALL') {
        const mId = (t.assigneeId?._id || t.assigneeId)?.toString();
        if (mId !== selectedMemberId) return false;
      }

      return true;
    });
  }, [workspaceTasks, timeframeBoundary, selectedProjectId, selectedMemberId]);

  // Reactive dynamic metrics
  const isFiltered = selectedTimeframe !== 'ALL' || selectedMemberId !== 'ALL' || selectedProjectId !== 'ALL';
  const dynamicTotalTasks = scopedTasks.length;
  const dynamicCompletedTasks = scopedTasks.filter((t: any) => t.status === 'DONE').length;
  const dynamicInProgressTasks = scopedTasks.filter((t: any) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW').length;
  const dynamicOverdueTasks = scopedTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE').length;
  const overdueTasksList = useMemo(() => {
    return scopedTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE');
  }, [scopedTasks, now]);
  const dynamicCompletionRate = dynamicTotalTasks > 0 ? Math.round((dynamicCompletedTasks / dynamicTotalTasks) * 100) : 0;

  // Multi-tier computation (Main Tasks, Subtasks, Minitasks, Microtasks)
  const multiTierStats = useMemo(() => {
    let subtasksCount = 0;
    let subtasksDone = 0;
    let subtasksInProg = 0;
    let subtasksOverdue = 0;

    let minitasksCount = 0;
    let minitasksDone = 0;
    let minitasksInProg = 0;
    let minitasksOverdue = 0;

    let microtasksCount = 0;
    let microtasksDone = 0;
    let microtasksInProg = 0;
    let microtasksOverdue = 0;

    scopedTasks.forEach((t: any) => {
      if (Array.isArray(t.subtasks)) {
        subtasksCount += t.subtasks.length;
        t.subtasks.forEach((st: any) => {
          const isDone = st.isCompleted || st.status === 'DONE';
          const isInProg = !isDone && (st.status === 'IN_PROGRESS' || st.status === 'IN_REVIEW');
          if (isDone) subtasksDone++;
          else if (isInProg) subtasksInProg++;
          if (st.dueDate && !isDone && new Date(st.dueDate) < now) subtasksOverdue++;

          if (Array.isArray(st.minitasks)) {
            minitasksCount += st.minitasks.length;
            st.minitasks.forEach((min: any) => {
              const isMinDone = min.isCompleted || min.status === 'DONE';
              const isMinInProg = !isMinDone && (min.status === 'IN_PROGRESS' || min.status === 'IN_REVIEW');
              if (isMinDone) minitasksDone++;
              else if (isMinInProg) minitasksInProg++;
              if (min.dueDate && !isMinDone && new Date(min.dueDate) < now) minitasksOverdue++;

              if (Array.isArray(min.microtasks)) {
                microtasksCount += min.microtasks.length;
                min.microtasks.forEach((mic: any) => {
                  const isMicDone = mic.isCompleted || mic.status === 'DONE';
                  const isMicInProg = !isMicDone && (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW');
                  if (isMicDone) microtasksDone++;
                  else if (isMicInProg) microtasksInProg++;
                  if (mic.dueDate && !isMicDone && new Date(mic.dueDate) < now) microtasksOverdue++;
                });
              }
            });
          }

          if (Array.isArray(st.microtasks)) {
            microtasksCount += st.microtasks.length;
            st.microtasks.forEach((mic: any) => {
              const isMicDone = mic.isCompleted || mic.status === 'DONE';
              const isMicInProg = !isMicDone && (mic.status === 'IN_PROGRESS' || mic.status === 'IN_REVIEW');
              if (isMicDone) microtasksDone++;
              else if (isMicInProg) microtasksInProg++;
              if (mic.dueDate && !isMicDone && new Date(mic.dueDate) < now) microtasksOverdue++;
            });
          }
        });
      }
    });

    const mainTotal = scopedTasks.length;
    const mainDone = dynamicCompletedTasks;
    const mainInProg = dynamicInProgressTasks;
    const mainOverdue = dynamicOverdueTasks;

    const combinedTotal = mainTotal + subtasksCount + minitasksCount + microtasksCount;
    const combinedDone = mainDone + subtasksDone + minitasksDone + microtasksDone;
    const combinedInProg = mainInProg + subtasksInProg + minitasksInProg + microtasksInProg;
    const combinedOverdue = mainOverdue + subtasksOverdue + minitasksOverdue + microtasksOverdue;

    let activeTotal = combinedTotal;
    let activeDone = combinedDone;
    let activeInProg = combinedInProg;
    let activeOverdue = combinedOverdue;

    if (workTier === 'MAIN') {
      activeTotal = mainTotal;
      activeDone = mainDone;
      activeInProg = mainInProg;
      activeOverdue = mainOverdue;
    } else if (workTier === 'SUBTASK') {
      activeTotal = subtasksCount;
      activeDone = subtasksDone;
      activeInProg = subtasksInProg;
      activeOverdue = subtasksOverdue;
    } else if (workTier === 'MINI') {
      activeTotal = minitasksCount;
      activeDone = minitasksDone;
      activeInProg = minitasksInProg;
      activeOverdue = minitasksOverdue;
    } else if (workTier === 'MICRO') {
      activeTotal = microtasksCount;
      activeDone = microtasksDone;
      activeInProg = microtasksInProg;
      activeOverdue = microtasksOverdue;
    }

    const activeCompletionRate = activeTotal > 0 ? Math.round((activeDone / activeTotal) * 100) : 0;

    return {
      mainTotal,
      mainDone,
      subtasksCount,
      subtasksDone,
      minitasksCount,
      minitasksDone,
      microtasksCount,
      microtasksDone,
      combinedTotal,
      combinedDone,
      activeTotal,
      activeDone,
      activeInProg,
      activeOverdue,
      activeCompletionRate
    };
  }, [scopedTasks, now, dynamicCompletedTasks, dynamicInProgressTasks, dynamicOverdueTasks, workTier]);

  // Dynamic Priority Breakdown
  const dynamicPriorityBreakdown = useMemo(() => {
    const counts: Record<string, number> = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0, LOWEST: 0 };
    scopedTasks.forEach((t: any) => {
      const pri = (t.priority || 'MEDIUM').toUpperCase();
      if (counts[pri] !== undefined) counts[pri]++;
      else counts.MEDIUM++;
    });
    return counts;
  }, [scopedTasks]);

  // Dynamic Type Breakdown
  const dynamicTypeBreakdown = useMemo(() => {
    const counts: Record<string, number> = { Task: 0, Bug: 0, Story: 0, Epic: 0, Subtask: 0 };
    scopedTasks.forEach((t: any) => {
      const typ = t.type ? (t.type.charAt(0).toUpperCase() + t.type.slice(1).toLowerCase()) : 'Task';
      if (counts[typ] !== undefined) counts[typ]++;
      else counts.Task++;
    });
    return counts;
  }, [scopedTasks]);

  // Dynamic Creation Trend
  const dynamicCreationTrend = useMemo(() => {
    if (scopedTasks.length === 0) return [];
    const dateMap = new Map<string, number>();
    scopedTasks.forEach((t: any) => {
      if (!t.createdAt) return;
      const dStr = new Date(t.createdAt).toISOString().split('T')[0];
      dateMap.set(dStr, (dateMap.get(dStr) || 0) + 1);
    });
    const sortedDates = Array.from(dateMap.keys()).sort();
    if (sortedDates.length === 1) {
      const firstDate = new Date(sortedDates[0]);
      const prevDate = new Date(firstDate.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return [
        { date: prevDate, count: 0 },
        { date: sortedDates[0], count: dateMap.get(sortedDates[0]) || 0 }
      ];
    }
    return sortedDates.map(date => ({ date, count: dateMap.get(date) || 0 }));
  }, [scopedTasks]);

  // Scoped Member Workload & Activity Stream according to selected project & member
  const displayedMemberWorkload = memberWorkload.filter((m: any) => {
    if (activeProject && (!m.projectIds || !m.projectIds.includes(activeProject._id))) return false;
    if (selectedMemberId !== 'ALL' && m._id !== selectedMemberId) return false;
    return true;
  });

  const displayedActivities = recentActivities.filter((a: any) => {
    if (activeProject) {
      const pId = (a.projectId?._id || a.projectId)?.toString();
      if (pId !== activeProject._id) return false;
    }
    if (selectedMemberId !== 'ALL') {
      const uId = (a.userId?._id || a.userId)?.toString();
      if (uId !== selectedMemberId) return false;
    }
    return true;
  });

  const orgTeams = dashboard?.teams || [];
  const teamsToDisplay = activeProject
    ? orgTeams.map((tm: any) => {
        const projTeamMatch = (activeProject.teams || []).find(
          (pt: any) => pt.name?.toLowerCase() === tm.name?.toLowerCase() || (pt._id && pt._id === tm._id)
        );
        return {
          ...tm,
          completedTasks: projTeamMatch ? (projTeamMatch.completedTasks || 0) : 0,
          totalTasks: projTeamMatch ? (projTeamMatch.totalTasks || 0) : 0,
          completionPercent: projTeamMatch ? (projTeamMatch.completionPercent || 0) : 0
        };
      })
    : orgTeams;

  const activeSprints = dashboard?.activeSprints || [];
  const personal = dashboard?.personal || {
    totalTasks: 0,
    openTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    overdueTasks: 0,
    dueSoonTasks: 0,
    completionRate: 0,
    tasks: [],
    recentActivities: []
  };

  const priorityColors: Record<string, string> = {
    URGENT: '#EF4444',
    HIGH: '#F97316',
    MEDIUM: '#F59E0B',
    LOW: '#22C55E',
    LOWEST: '#94A3B8'
  };

  const statusColors: Record<string, string> = {
    BACKLOG: '#94A3B8',
    TODO: '#3B82F6',
    IN_PROGRESS: '#F59E0B',
    IN_REVIEW: '#8B5CF6',
    DONE: '#22C55E'
  };

  const statusLabels: Record<string, string> = {
    BACKLOG: 'Backlog',
    TODO: 'To Do',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    DONE: 'Done'
  };

  const typeColors: Record<string, string> = {
    Bug: '#EF4444',
    Task: '#3B82F6',
    Story: '#8B5CF6',
    Epic: '#F59E0B',
    Subtask: '#06B6D4'
  };

  // Computed chart data from dynamic scoped values
  const priorityEntries = Object.entries(dynamicPriorityBreakdown).filter(([, v]) => (v as number) > 0);
  const priorityTotal = priorityEntries.reduce((s, [, v]) => s + (v as number), 0);
  const typeEntries = Object.entries(dynamicTypeBreakdown).filter(([, v]) => (v as number) > 0);
  const typeTotal = typeEntries.reduce((s, [, v]) => s + (v as number), 0);

  // Priority donut conic gradient
  const priorityDonutGradient = (() => {
    if (priorityTotal === 0) return 'conic-gradient(#E5E7EB 0deg 360deg)';
    let angle = 0;
    const stops = priorityEntries.map(([key, val]) => {
      const deg = ((val as number) / priorityTotal) * 360;
      const stop = `${priorityColors[key] || '#94A3B8'} ${angle}deg ${angle + deg}deg`;
      angle += deg;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  })();

  // Type donut conic gradient
  const typeDonutGradient = (() => {
    if (typeTotal === 0) return 'conic-gradient(#E5E7EB 0deg 360deg)';
    let angle = 0;
    const stops = typeEntries.map(([key, val]) => {
      const deg = ((val as number) / typeTotal) * 360;
      const stop = `${typeColors[key] || '#94A3B8'} ${angle}deg ${angle + deg}deg`;
      angle += deg;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  })();

  // Dynamic trend sparkline
  const activeTrendData = dynamicCreationTrend.length > 0 ? dynamicCreationTrend : creationTrend;
  const trendMax = Math.max(1, ...activeTrendData.map((d: any) => d.count));

  // Sparkline SVG points for creation trend
  const sparklinePoints = activeTrendData.length > 1
    ? activeTrendData.map((d: any, i: number) => {
        const x = (i / Math.max(1, activeTrendData.length - 1)) * 240;
        const y = 52 - (d.count / trendMax) * 44;
        return `${x},${y}`;
      }).join(' ')
    : '';
  const sparklineAreaPoints = sparklinePoints ? `0,52 ${sparklinePoints} 240,52` : '';

  // Filter personal tasks
  const filteredPersonalTasks = (personal.tasks || []).filter((t: any) => {
    if (taskSearch) {
      const q = taskSearch.toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchKey = t.key?.toLowerCase().includes(q);
      const matchProj = t.project?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchKey && !matchProj) return false;
    }

    if (myTaskFilter === 'IN_PROGRESS') return t.status === 'IN_PROGRESS';
    if (myTaskFilter === 'TODO') return t.status === 'TODO' || t.status === 'BACKLOG';
    if (myTaskFilter === 'DONE') return t.status === 'DONE';
    if (myTaskFilter === 'DUE_SOON') {
      if (!t.dueDate || t.status === 'DONE') return false;
      const due = new Date(t.dueDate);
      const now = new Date();
      const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return due <= next7Days;
    }
    return true;
  });

  const renderPortfolioSection = () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <FolderKanban className="w-6 h-6 text-blue-600" />
            <span>Projects & Teams Portfolio Status</span>
            <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {portfolioProjects.length} {portfolioProjects.length === 1 ? 'Project' : 'Projects'}
            </span>
          </h3>
          <p className="text-sm text-gray-600 font-medium mt-0.5">
            Detailed status of each project: active sprints, workflow stages, and multi-discipline engineering teams.
          </p>
        </div>
      </div>

      {portfolioProjects.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-gray-200 text-center text-sm text-gray-400 font-medium">
          No active projects found in this workspace.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {portfolioProjects.map((proj: any) => {
            const fullProj = projects.find((p: any) => p._id === proj._id);
            const isHealthy = proj.health === 'ON_TRACK';
            const isAtRisk = proj.health === 'AT_RISK';

            return (
              <div
                key={proj._id}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-xs hover:shadow-md transition-all overflow-hidden"
              >
                {/* 1. Project Top Header */}
                <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
                      style={{ backgroundColor: proj.color || '#0F172A' }}
                    >
                      <FolderKanban className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h4 className="text-lg font-black text-[#0F172A]">{proj.name}</h4>
                        <span className="text-xs font-mono font-extrabold bg-gray-100 text-gray-800 px-2.5 py-1 rounded-lg border border-gray-200">
                          [{proj.key}]
                        </span>
                        <span
                          className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                            isHealthy
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isAtRisk
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {isHealthy ? '● ON TRACK' : isAtRisk ? '▲ AT RISK' : '■ BEHIND'}
                        </span>
                        {proj.category && (
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            {proj.category}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mt-1.5 font-medium">
                        {proj.lead && (
                          <span className="flex items-center gap-1.5">
                            <span className="text-gray-400">Project Lead:</span>
                            <strong className="text-gray-900 font-bold">{proj.lead.name}</strong>
                          </span>
                        )}
                        <span>•</span>
                        <span className="flex items-center gap-2 flex-wrap">
                          <span>
                            <strong className="text-gray-900 font-bold">{proj.totalDeliverables || proj.totalTasks}</strong> tasks ({proj.completedDeliverables ?? proj.completedTasks} completed)
                          </span>
                          {(proj.subtasksCount > 0 || proj.minitasksCount > 0 || proj.microtasksCount > 0) && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 font-bold">
                              <span>{proj.mainTasksCount || 1} Main</span>
                              <span className="text-slate-300">•</span>
                              <span>{proj.subtasksCount || 0} Sub</span>
                              <span className="text-slate-300">•</span>
                              <span>{proj.minitasksCount || 0} Mini</span>
                              {proj.microtasksCount > 0 && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span>{proj.microtasksCount} Micro</span>
                                </>
                              )}
                            </span>
                          )}
                        </span>
                        {proj.overdueTasks > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-rose-600 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-4 h-4" />
                              {proj.overdueTasks} overdue
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct Action Buttons */}
                  <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
                    <button
                      onClick={() => {
                        if (fullProj && onSelectProject) {
                          setCurrentProject(fullProj);
                          onSelectProject(fullProj);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F172A] text-white hover:bg-slate-800 text-xs sm:text-sm font-bold transition-all shadow-sm cursor-pointer"
                    >
                      <FolderKanban className="w-4 h-4" />
                      <span>Open Board</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 2. Milestone & Project Progress Bar */}
                <div className="px-6 py-4 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-sm font-bold mb-1.5">
                      <span className="text-gray-700">Overall Project Completion</span>
                      <span className="text-[#0F172A] font-black text-base">{proj.completionPercent}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${proj.completionPercent}%`,
                          backgroundColor:
                            proj.completionPercent >= 75
                              ? '#22C55E'
                              : proj.completionPercent >= 40
                              ? '#3B82F6'
                              : '#F59E0B'
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs sm:text-sm font-bold text-gray-600 sm:border-l sm:border-gray-100 sm:pl-5">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#22C55E]" />
                      <span>{proj.completedDeliverables ?? proj.completedTasks} Done</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span>{proj.inProgressDeliverables ?? proj.inProgressTasks} In Progress</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-500" />
                      <span>{proj.todoDeliverables ?? (proj.todoTasks + (proj.backlogTasks || 0))} To Do</span>
                    </span>
                  </div>
                </div>

                {/* 3. Sprints, Workflow Stages, and Teams Sub-Grids */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/40">
                  {/* LEFT: Sprints & Stages (5 cols) */}
                  <div className="lg:col-span-5 flex flex-col gap-4">
                    {/* Active Sprint Widget */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs">
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" />
                          <h5 className="text-sm font-extrabold text-gray-900">
                            {proj.activeSprint ? proj.activeSprint.name : 'Sprint Status'}
                          </h5>
                        </div>
                        {proj.activeSprint ? (
                          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                            {proj.activeSprint.daysRemaining} days left
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-gray-400">
                            {proj.completedSprints || 0} completed
                          </span>
                        )}
                      </div>

                      {proj.activeSprint ? (
                        <div>
                          {proj.activeSprint.goal && (
                            <p className="text-xs text-gray-600 font-medium italic mb-3 line-clamp-2">
                              "{proj.activeSprint.goal}"
                            </p>
                          )}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-gray-600 font-semibold">Sprint Velocity</span>
                              <span className="font-extrabold text-gray-900">
                                {proj.activeSprint.completedTasks} / {proj.activeSprint.totalTasks} tasks ({proj.activeSprint.completionPercent}%)
                              </span>
                            </div>
                            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                style={{ width: `${proj.activeSprint.completionPercent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-3 text-xs text-gray-400 italic font-medium">
                          No active sprint currently running.
                        </div>
                      )}
                    </div>

                    {/* Workflow Stages Breakdown */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs">
                      <h5 className="text-sm font-extrabold text-gray-900 mb-3 flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-blue-600" />
                          Workflow Stages Detail
                        </span>
                        <span className="text-xs text-gray-500 font-semibold">
                          {proj.stages?.length || 0} stages
                        </span>
                      </h5>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {(proj.stages || []).map((stg: any) => (
                          <div
                            key={stg.id}
                            className="p-3 rounded-xl bg-gray-50/90 border border-gray-100 flex flex-col justify-between"
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-gray-700 truncate">
                                {stg.label}
                              </span>
                              <span className="text-xs font-extrabold text-gray-500">
                                {stg.percent}%
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between">
                              <span className="text-base font-black text-[#0F172A]">{stg.count}</span>
                              <span className="text-xs font-semibold text-gray-400">
                                tasks
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* RIGHT: Specialized Disciplines & Teams Grid (7 cols) */}
                  <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3.5">
                        <h5 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-600" />
                          Specialized Engineering Teams ({proj.teams?.length || 0})
                        </h5>
                        <span className="text-xs text-gray-500 font-semibold">
                          Cross-discipline task distribution
                        </span>
                      </div>

                      {(!proj.teams || proj.teams.length === 0) ? (
                        <div className="text-center py-8 text-xs text-gray-400 font-medium">
                          No specialized sub-teams configured for this project.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {proj.teams.map((tm: any) => (
                            <div
                              key={tm._id || tm.name}
                              className="p-3.5 rounded-xl bg-slate-50/80 border border-gray-200/80 hover:border-gray-300 transition-all flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="w-3 h-3 rounded-full shrink-0"
                                      style={{ backgroundColor: tm.color || '#3B82F6' }}
                                    />
                                    <span className="text-xs sm:text-sm font-extrabold text-gray-900 truncate">
                                      {tm.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {tm.overdueTasks > 0 && (
                                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-0.5">
                                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                                        {tm.overdueTasks} overdue
                                      </span>
                                    )}
                                    <span className="text-xs font-black text-gray-700">
                                      {tm.completionPercent}%
                                    </span>
                                  </div>
                                </div>

                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden my-2">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${tm.completionPercent}%`,
                                      backgroundColor: tm.color || '#3B82F6'
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-xs text-gray-600 pt-1 font-semibold">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-emerald-700 font-bold">{tm.completedTasks} Done</span>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-amber-700 font-bold">{Math.max(0, tm.totalTasks - tm.completedTasks)} Pending</span>
                                  <span className="text-gray-400 font-medium">({tm.totalTasks} Total)</span>
                                </div>
                                <span className="shrink-0 text-slate-500 font-medium">
                                  {tm.membersCount > 0 && `${tm.membersCount} devs · `}
                                  {`${tm.inProgressTasks} WIP`}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer Info Pill */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-semibold">
                      <span>Project Key: <strong className="text-gray-800">[{proj.key}]</strong></span>
                      <span>Total Sprints: <strong className="text-gray-800">{proj.totalSprints || 1}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse max-w-7xl mx-auto">
        <div className="h-24 bg-white rounded-2xl border border-gray-200/80" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-gray-200/80" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white rounded-2xl border border-gray-200/80" />
          <div className="h-72 bg-white rounded-2xl border border-gray-200/80" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-[#111827] max-w-7xl mx-auto select-none animate-fade-in">
      {/* Dashboard Header with Org/Personal Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-[#0F172A] tracking-tight">Dashboard</h2>
            <p className="text-xs text-gray-500 font-medium">{currentWorkspace?.name || 'Workspace'} overview</p>
          </div>
        </div>
        <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200/80">
          <button
            onClick={() => setViewMode('organization')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              viewMode === 'organization'
                ? 'bg-white text-[#0F172A] shadow-sm border border-gray-200/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Organization
            </span>
          </button>
          <button
            onClick={() => setViewMode('personal')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
              viewMode === 'personal'
                ? 'bg-white text-[#0F172A] shadow-sm border border-gray-200/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              My Dashboard
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🏢 ORGANIZATION / WORKSPACE OVERVIEW                                      */}
      {/* ========================================================================= */}
      {viewMode === 'organization' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Unified Dynamic Workspace Filter Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col gap-3">
            {/* Top row: Filter icon + Timeframe pills + Member selector + Reset */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <Filter className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-black text-[#0F172A] uppercase tracking-wider">Timeline & Scope Filters</span>
                  <p className="text-[11px] text-gray-500 font-medium">Filter metrics, graphs and roadmap by window & assignee</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Timeframe Filter Buttons */}
                <div className="flex items-center p-1 bg-gray-100 rounded-xl border border-gray-200/60">
                  {(
                    [
                      { id: '24h', label: '24h', full: 'Today (24h)' },
                      { id: '7d', label: '7d', full: 'Week (7d)' },
                      { id: '30d', label: '30d', full: 'Month (30d)' },
                      { id: '1y', label: '1y', full: 'Year (1y)' },
                      { id: 'ALL', label: 'ALL', full: 'All Time' }
                    ] as const
                  ).map((tf) => {
                    const active = selectedTimeframe === tf.id;
                    return (
                      <button
                        key={tf.id}
                        onClick={() => setSelectedTimeframe(tf.id)}
                        title={tf.full}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                          active
                            ? 'bg-white text-blue-700 shadow-xs border border-gray-200/50'
                            : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        {tf.label}
                      </button>
                    );
                  })}
                </div>

                {/* Member Filter Dropdown */}
                <div className="flex items-center gap-1">
                  <select
                    value={selectedMemberId}
                    onChange={(e) => setSelectedMemberId(e.target.value)}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 font-bold text-gray-800 outline-none focus:border-blue-600 cursor-pointer shadow-2xs hover:bg-white transition-colors"
                  >
                    <option value="ALL">👤 All Members ({workspaceMembers.length || 'All'})</option>
                    {workspaceMembers.map((m: any) => {
                      const u = m.userId || m;
                      const uid = u._id || m._id;
                      return (
                        <option key={uid} value={uid}>
                          👤 {u.name || u.email || 'Member'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Reset Filters Button if modified */}
                {isFiltered && (
                  <button
                    onClick={() => {
                      setSelectedTimeframe('30d');
                      setSelectedMemberId('ALL');
                      setSelectedProjectId('ALL');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-gray-500 hover:text-rose-600 bg-gray-100 hover:bg-rose-50 border border-gray-200/80 transition-all cursor-pointer"
                    title="Reset to defaults"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom row: Project Scope Buttons */}
            <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 font-bold">
                <span>Project Scope:</span>
                {activeProject ? (
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    [{activeProject.key}] {activeProject.name}
                  </span>
                ) : (
                  <span className="text-xs font-extrabold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                    All {displayedProjects.length} Projects
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSelectedProjectId('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedProjectId === 'ALL'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Projects ({displayedProjects.length})
                </button>
                {displayedProjects.map((p: any) => {
                  const isSelected = selectedProjectId === p._id;
                  return (
                    <button
                      key={p._id}
                      onClick={() => setSelectedProjectId(p._id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#0F172A] text-white shadow-xs'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color || '#3B82F6' }}
                      />
                      <span>[{p.key}]</span>
                      <span className="max-w-[130px] truncate">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 🚀 If a particular project is selected, show its Portfolio Command card right ON TOP */}
          {activeProject && renderPortfolioSection()}

          {/* Work Hierarchy Tier Selector Bar (Main Tasks vs Subtasks vs Microtasks vs Combined) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-gray-200/80 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                Work Scope:
              </span>
              <div className="inline-flex p-1 bg-gray-100 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setWorkTier('COMBINED')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    workTier === 'COMBINED' ? 'bg-[#0F172A] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Combined All ({multiTierStats.combinedTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkTier('MAIN')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    workTier === 'MAIN' ? 'bg-blue-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Main Tasks ({multiTierStats.mainTotal})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkTier('SUBTASK')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    workTier === 'SUBTASK' ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Subtasks ({multiTierStats.subtasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkTier('MINI')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    workTier === 'MINI' ? 'bg-teal-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Mini-tasks ({multiTierStats.minitasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setWorkTier('MICRO')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    workTier === 'MICRO' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Microtasks ({multiTierStats.microtasksCount})
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-500 font-semibold flex items-center gap-3">
              <span>Main: <strong className="text-gray-800">{multiTierStats.mainDone}/{multiTierStats.mainTotal}</strong></span>
              <span>•</span>
              <span>Sub: <strong className="text-gray-800">{multiTierStats.subtasksDone}/{multiTierStats.subtasksCount}</strong></span>
              <span>•</span>
              <span>Mini: <strong className="text-gray-800">{multiTierStats.minitasksDone}/{multiTierStats.minitasksCount}</strong></span>
              <span>•</span>
              <span>Micro: <strong className="text-gray-800">{multiTierStats.microtasksDone}/{multiTierStats.microtasksCount}</strong></span>
            </div>
          </div>

          {/* Dynamic Reactive KPI Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: activeProject
                  ? `[${activeProject.key}] Scope`
                  : workTier === 'COMBINED'
                  ? 'All Work Items'
                  : workTier === 'MAIN'
                  ? 'Main Tasks Scope'
                  : workTier === 'SUBTASK'
                  ? 'Subtasks Scope'
                  : workTier === 'MINI'
                  ? 'Mini-tasks Scope'
                  : 'Microtasks Scope',
                value: activeProject
                  ? `${multiTierStats.activeTotal} Items (${activeProject.name})`
                  : `${multiTierStats.activeTotal} Items`,
                isText: false,
                icon: FolderKanban,
                iconBg: 'bg-blue-50',
                iconColor: 'text-blue-600',
                sub: activeProject
                  ? `Category: ${activeProject.category || 'Engineering'} • ${activeProject.health}`
                  : `${workspaceMembers.length || ov.totalMembers || 0} active members • ${selectedTimeframe === 'ALL' ? 'All time' : selectedTimeframe}`
              },
              {
                label: workTier === 'COMBINED' ? 'In Progress Items' : `${workTier.charAt(0) + workTier.slice(1).toLowerCase()} In Progress`,
                value: multiTierStats.activeInProg,
                icon: Layers,
                iconBg: 'bg-purple-50',
                iconColor: 'text-purple-600',
                sub: `${multiTierStats.activeTotal - multiTierStats.activeDone - multiTierStats.activeInProg} pending backlog/todo`
              },
              {
                label: 'Completed',
                value: multiTierStats.activeDone,
                icon: CheckCircle2,
                iconBg: 'bg-emerald-50',
                iconColor: 'text-[#22C55E]',
                sub: `${multiTierStats.activeCompletionRate}% completion rate (${multiTierStats.activeDone}/${multiTierStats.activeTotal})`
              },
              {
                label: 'Overdue / Alerts',
                value: multiTierStats.activeOverdue,
                icon: AlertTriangle,
                iconBg: 'bg-rose-50',
                iconColor: 'text-rose-500',
                isClickable: true,
                onClick: () => {
                  setOverdueModalScope('ALL');
                  setIsOverdueModalOpen(true);
                },
                sub: multiTierStats.activeOverdue > 0
                  ? `${multiTierStats.activeOverdue} ${workTier === 'COMBINED' ? 'items' : workTier.toLowerCase() + 's'} require urgent attention`
                  : 'All deadlines on track'
              }
            ].map((card, idx) => (
              <div
                key={idx}
                onClick={card.onClick}
                className={`bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between group transition-all ${
                  card.isClickable
                    ? 'cursor-pointer hover:border-rose-400 hover:shadow-md hover:ring-2 hover:ring-rose-100/80'
                    : 'hover:shadow-md'
                }`}
              >
                <div className="min-w-0 pr-2 flex-1">
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider block truncate">
                    {card.label}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <h3 className={`${card.isText ? 'text-sm sm:text-base truncate' : 'text-3xl'} font-black text-[#0F172A]`}>
                      {card.value}
                    </h3>
                    {card.isClickable && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 group-hover:bg-rose-100 text-rose-600 border border-rose-200/80 transition-colors inline-flex items-center gap-1 whitespace-nowrap shadow-2xs">
                        <span>View List</span>
                        <span className="group-hover:translate-x-0.5 transition-transform font-bold">→</span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 font-semibold mt-0.5 block truncate">{card.sub}</span>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs shrink-0`}
                >
                  <card.icon className="w-6 h-6" />
                </div>
              </div>
            ))}
          </div>

          {/* ========================================================================= */}
          {/* 📊 ANALYTICS: Priority, Type & Creation Trend Charts                      */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Priority Breakdown Donut */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Priority Breakdown
              </h3>
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <div
                    className="w-28 h-28 rounded-full"
                    style={{ background: priorityDonutGradient }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white flex flex-col items-center justify-center shadow-xs">
                      <span className="text-base font-black text-[#0F172A] leading-tight">{priorityTotal}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none mt-0.5">Total</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {priorityEntries.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No priority data</span>
                  )}
                  {priorityEntries.map(([key, val]) => {
                    const pct = priorityTotal > 0 ? Math.round(((val as number) / priorityTotal) * 100) : 0;
                    const color = priorityColors[key] || '#94A3B8';
                    return (
                      <div key={key} className="flex flex-col gap-1 py-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: color }} />
                            <span className="font-bold text-gray-700 capitalize truncate">{key.toLowerCase()}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black text-[#0F172A]">{val as number}</span>
                            <span className="text-gray-400 font-semibold text-[11px] w-9 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Type Distribution Donut */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs">
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                Task Type Distribution
              </h3>
              <div className="flex items-center gap-5">
                <div className="relative shrink-0">
                  <div
                    className="w-28 h-28 rounded-full"
                    style={{ background: typeDonutGradient }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white flex flex-col items-center justify-center shadow-xs">
                      <span className="text-base font-black text-[#0F172A] leading-tight">{typeTotal}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none mt-0.5">Total</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {typeEntries.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No type data</span>
                  )}
                  {typeEntries.map(([key, val]) => {
                    const pct = typeTotal > 0 ? Math.round(((val as number) / typeTotal) * 100) : 0;
                    const color = typeColors[key] || '#94A3B8';
                    return (
                      <div key={key} className="flex flex-col gap-1 py-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: color }} />
                            <span className="font-bold text-gray-700 truncate">{key}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-black text-[#0F172A]">{val as number}</span>
                            <span className="text-gray-400 font-semibold text-[11px] w-9 text-right">
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Creation Trend Sparkline */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col">
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  Creation Trend
                </span>
                <span className="text-xs font-bold text-gray-500">Last {creationTrend.length} days</span>
              </h3>
              {creationTrend.length > 1 ? (
                <div className="flex flex-col gap-2 flex-1 justify-between">
                  <svg viewBox="0 0 240 58" className="w-full h-20" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <polygon points={sparklineAreaPoints} fill="url(#trendGrad)" />
                    <polyline points={sparklinePoints} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {creationTrend.map((d: any, i: number) => {
                      const x = (i / Math.max(1, creationTrend.length - 1)) * 240;
                      const y = 52 - (d.count / trendMax) * 44;
                      return <circle key={i} cx={x} cy={y} r="3" fill="#3B82F6" stroke="white" strokeWidth="1.5" />;
                    })}
                  </svg>
                  <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                    {creationTrend.length > 0 && (
                      <>
                        <span>{creationTrend[0]?.date ? new Date(creationTrend[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                        <span className="font-bold text-[#0F172A]">{creationTrend.reduce((s: number, d: any) => s + d.count, 0)} total created</span>
                        <span>{creationTrend[creationTrend.length - 1]?.date ? new Date(creationTrend[creationTrend.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center flex-1">
                  <TrendingUp className="w-8 h-8 text-gray-200 mb-2" />
                  <span className="text-xs text-gray-400 font-medium">Not enough data for trend analysis</span>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 🌲 HIERARCHICAL TIMELINE TREE & ROADMAP (Commented out as requested)       */}
          {/* ========================================================================= */}
          {/*
          <TimelineTree
            tasks={workspaceTasks}
            projects={projects}
            sprints={activeSprints}
            teams={dashboard?.teams || []}
            members={workspaceMembers}
            selectedProjectId={selectedProjectId}
            selectedMemberId={selectedMemberId}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            onMemberChange={setSelectedMemberId}
            onProjectChange={setSelectedProjectId}
            onSelectTask={onSelectTask}
          />
          */}

          {/* ========================================================================= */}
          {/* 📊 PROJECT & TEAMS COMPLETION COMPARISON (PLACED ABOVE PROJECTS)          */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Project Task Progress & Velocity Comparison */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    <span>Project Completion Comparison</span>
                  </h3>
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                    Progress
                  </span>
                </div>

                {activeProject ? (
                  <div className="flex flex-col gap-3.5">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <div className="flex items-center gap-2 truncate">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: activeProject.color || '#0F172A' }}
                          />
                          <span className="font-extrabold text-gray-900 truncate">{activeProject.name}</span>
                          <span className="text-xs font-mono font-bold text-gray-400">[{activeProject.key}]</span>
                        </div>
                        <span className="font-black text-[#0F172A] ml-2 shrink-0 text-xs sm:text-sm">
                          {activeProject.completedTasks} / {activeProject.totalTasks} Tasks ({activeProject.completionPercent}%)
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${activeProject.completionPercent}%`,
                            backgroundColor: activeProject.color || '#3B82F6'
                          }}
                        />
                      </div>
                    </div>

                    {/* Active Project Workflow Stages Pipeline */}
                    {activeProject.stages && activeProject.stages.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1 pt-2.5 border-t border-gray-100">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Stages Pipeline:</span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {activeProject.stages.map((stg: any) => (
                            <div key={stg.id} className="p-2.5 rounded-xl bg-gray-50/80 border border-gray-100">
                              <span className="text-xs font-bold text-gray-500 block truncate">{stg.label}</span>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-sm font-black text-[#0F172A]">{stg.count} tasks</span>
                                <span className="text-xs font-bold text-gray-400">{stg.percent}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {displayedProjects.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center bg-gray-50/70 rounded-xl border border-dashed border-gray-200">
                        <FolderKanban className="w-8 h-8 text-gray-300 mb-2" />
                        <p className="text-sm font-bold text-gray-700">No active projects to compare yet</p>
                        <p className="text-xs text-gray-400 mt-0.5">Projects created in this workspace will display completion progress here.</p>
                      </div>
                    ) : (
                      displayedProjects.map((p: any) => (
                        <div key={p._id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs sm:text-sm">
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-xs shrink-0"
                                style={{ backgroundColor: p.color || '#0F172A' }}
                              />
                              <span className="font-extrabold text-gray-900 truncate">{p.name}</span>
                              <span className="text-xs font-mono font-bold text-gray-400">[{p.key}]</span>
                            </div>
                            <span className="font-black text-[#0F172A] ml-2 shrink-0 text-xs sm:text-sm">
                              {p.completedTasks} / {p.totalTasks} Tasks ({p.completionPercent}%)
                            </span>
                          </div>
                          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${p.completionPercent}%`,
                                backgroundColor: p.color || '#3B82F6'
                              }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center justify-between">
                <span>{activeProject ? `Completed tasks vs Total backlog for ${activeProject.name}` : 'Completed tasks vs Total backlog'}</span>
                <span className="font-bold text-gray-700">Real-time sync</span>
              </div>
            </div>

            {/* 2. Dynamic Organization Teams / Capacity */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-600" />
                    <span>Organization Teams & Capacity</span>
                  </h3>
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                    {teamsToDisplay.length} TEAMS
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {teamsToDisplay.length === 0 ? (
                    <div className="p-6 text-center bg-gray-50/70 rounded-xl border border-dashed border-gray-200">
                      <Users className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                      <p className="text-xs font-bold text-gray-600">No organization teams created yet</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 mb-2">Create dynamic teams to track resource capacity across projects.</p>
                      {onNavigateTab && (
                        <button
                          onClick={() => onNavigateTab('teams-management')}
                          className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          + Go to Teams Management
                        </button>
                      )}
                    </div>
                  ) : (
                    teamsToDisplay.map((tm: any) => (
                      <div key={tm._id || tm.name} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: tm.color || '#3B82F6' }}
                            />
                            <span className="font-bold text-gray-800 truncate">{tm.name}</span>
                            {tm.key && (
                              <span className="font-mono text-xs text-gray-400 font-bold">[{tm.key}]</span>
                            )}
                            {tm.department && (
                              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-semibold hidden sm:inline">
                                {tm.department}
                              </span>
                            )}
                          </div>
                          <span className="font-black text-gray-900 text-xs sm:text-sm ml-2 shrink-0">
                            {tm.completedTasks || 0}/{tm.totalTasks || 0} tasks ({tm.completionPercent || 0}%)
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${tm.completionPercent || 0}%`, backgroundColor: tm.color || '#3B82F6' }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-gray-100 text-xs text-gray-500 font-medium">
                {activeProject
                  ? `Organization teams capacity in ${activeProject.name}`
                  : 'Organization teams capacity across projects'}
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 🚀 PROJECT & ENGINEERING TEAMS COMMAND MATRIX (ALL PROJECTS VIEW)         */}
          {/* ========================================================================= */}
          {!activeProject && renderPortfolioSection()}

          {/* Grid: Member Workload + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Member Workload */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs">
              <h3 className="text-base font-black text-[#0F172A] mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#22C55E]" />
                  Member Capacity & Workload
                </span>
                <span className="text-xs text-gray-400 font-bold">
                  {activeProject ? `Contributors on [${activeProject.key}]` : 'Top contributors'}
                </span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {displayedMemberWorkload.length === 0 && (
                  <span className="text-sm text-gray-400 text-center py-4 col-span-2 font-medium">
                    {activeProject
                      ? `No active task assignments on [${activeProject.key}]`
                      : 'No active assignments'}
                  </span>
                )}
                {displayedMemberWorkload.map((member: any) => (
                  <div
                    key={member._id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100 hover:bg-gray-100/80 transition-all"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0F172A] to-[#334155] text-white flex items-center justify-center text-xs font-black uppercase shrink-0 shadow-xs">
                      {member.avatar ? (
                        <img
                          src={
                            member.avatar.startsWith('http')
                              ? member.avatar
                              : `${getBackendUrl()}${member.avatar.startsWith('/') ? '' : '/'}${member.avatar}`
                          }
                          alt={member.name}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        member.name?.charAt(0) || '?'
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-[#0F172A] truncate block">{member.name}</span>
                      <span className="text-xs text-gray-500 font-medium">{member.openTasks} open tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {member.highPriority > 0 && (
                        <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                          {member.highPriority} 🔥
                        </span>
                      )}
                      <span className="text-xs font-black text-[#0F172A] bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                        {member.inProgress} WIP
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity Feed */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs">
              <h3 className="text-base font-black text-[#0F172A] mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Live Workspace Stream
                </span>
                <span className="text-xs text-gray-400 font-bold">
                  {activeProject ? `Live actions in [${activeProject.key}]` : 'Real-time actions'}
                </span>
              </h3>
              <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto">
                {displayedActivities.length === 0 && (
                  <span className="text-sm text-gray-400 text-center py-4 font-medium">
                    {activeProject
                      ? `No recent activity in [${activeProject.key}]`
                      : 'No recent activity'}
                  </span>
                )}
                {displayedActivities.map((act: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-all border-b border-gray-50 last:border-0"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-xs font-black uppercase shrink-0 mt-0.5">
                      {act.userId?.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs sm:text-sm text-gray-700 leading-snug block">
                        <strong className="text-[#0F172A] font-bold">{act.userId?.name || 'Someone'}</strong>{' '}
                        {act.action || 'updated'}{' '}
                        {act.taskId && (
                          <span className="font-mono text-xs font-bold text-[#0F172A] bg-gray-100 px-1.5 py-0.5 rounded">
                            {act.taskId.key}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400 font-medium mt-0.5 block">
                        {new Date(act.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        {act.projectId && (
                          <>
                            {' '}
                            · <span className="font-bold text-gray-600">{act.projectId.name}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 👤 MODE 2: PERSONAL / MY DASHBOARD                                       */}
      {/* ========================================================================= */}
      {viewMode === 'personal' && (
        <div className="flex flex-col gap-6 animate-fade-in">
          {/* Personal KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">My Open Tasks</span>
                <h3 className="text-3xl font-black text-[#0F172A] mt-1">{personal.openTasks || 0}</h3>
                <span className="text-xs text-blue-600 font-bold">Assigned to you</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">In Progress</span>
                <h3 className="text-3xl font-black text-amber-600 mt-1">{personal.inProgressTasks || 0}</h3>
                <span className="text-xs text-amber-600 font-bold">Active work items</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
            </div>

            <div
              onClick={() => {
                setOverdueModalScope('MINE');
                setIsOverdueModalOpen(true);
              }}
              className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between cursor-pointer hover:border-rose-400 hover:shadow-md hover:ring-2 hover:ring-rose-100/80 transition-all group"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Due Soon / Overdue</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 group-hover:bg-rose-100 text-rose-600 border border-rose-200/80 transition-colors inline-flex items-center gap-1 whitespace-nowrap shadow-2xs">
                    <span>View List</span>
                    <span className="group-hover:translate-x-0.5 transition-transform font-bold">→</span>
                  </span>
                </div>
                <h3 className="text-3xl font-black text-rose-600 mt-1">
                  {(personal.overdueTasks || 0) + (personal.dueSoonTasks || 0)}
                </h3>
                <span className="text-xs text-rose-600 font-bold">
                  {personal.overdueTasks || 0} overdue · {personal.dueSoonTasks || 0} next 7d
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-xs">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Completion Rate</span>
                <h3 className="text-3xl font-black text-[#22C55E] mt-1">{personal.completionRate || 0}%</h3>
                <span className="text-xs text-emerald-600 font-bold">
                  {personal.completedTasks || 0} completed of {personal.totalTasks || 0}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#22C55E] flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Main Area: My Assigned Tasks Table + Personal Side Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* My Tasks List (Span 2) */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-5 sm:p-6 shadow-xs flex flex-col">
              {/* Header with Search & Filter Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-3">
                <div>
                  <h3 className="text-base font-black text-[#0F172A] flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <span>My Assigned Work Items</span>
                    <span className="text-xs font-bold bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full">
                      {filteredPersonalTasks.length}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Click any task to view details or update its progress.
                  </p>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search my tasks..."
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-semibold"
                  />
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar border-b border-gray-100">
                {[
                  { id: 'ALL', label: 'All Tasks', count: personal.tasks?.length || 0 },
                  { id: 'IN_PROGRESS', label: 'In Progress', count: personal.inProgressTasks || 0 },
                  { id: 'TODO', label: 'To Do', count: (personal.openTasks || 0) - (personal.inProgressTasks || 0) },
                  { id: 'DUE_SOON', label: 'Due Soon / Overdue', count: (personal.overdueTasks || 0) + (personal.dueSoonTasks || 0) },
                  { id: 'DONE', label: 'Done', count: personal.completedTasks || 0 }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setMyTaskFilter(tab.id as any)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors shrink-0 cursor-pointer ${
                      myTaskFilter === tab.id
                        ? 'bg-[#0F172A] text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="ml-1.5 opacity-80 text-xs font-bold">({tab.count})</span>
                  </button>
                ))}
              </div>

              {/* Tasks List */}
              <div className="divide-y divide-gray-100 overflow-y-auto max-h-[460px] mt-2">
                {filteredPersonalTasks.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400 font-medium">
                    No work items found matching the selected filter.
                  </div>
                ) : (
                  filteredPersonalTasks.map((t: any) => {
                    const isOverdue =
                      t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < new Date();
                    return (
                      <div
                        key={t._id}
                        onClick={() => onSelectTask && onSelectTask(t)}
                        className="py-3.5 px-3 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          {/* Project Tag */}
                          {t.project && (
                            <span
                              className="text-xs font-mono font-bold px-2 py-0.5 rounded text-white shrink-0"
                              style={{ backgroundColor: t.project.color || '#0F172A' }}
                              title={t.project.name}
                            >
                              [{t.project.key}]
                            </span>
                          )}

                          <span className="font-mono text-xs sm:text-sm font-bold text-gray-400 group-hover:text-blue-600 shrink-0">
                            {t.key}
                          </span>

                          <span className="text-xs sm:text-sm font-bold text-[#0F172A] truncate group-hover:text-blue-600 transition-colors">
                            {t.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {/* Priority */}
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded"
                            style={{
                              backgroundColor: `${priorityColors[t.priority] || '#94A3B8'}15`,
                              color: priorityColors[t.priority] || '#94A3B8'
                            }}
                          >
                            {t.priority}
                          </span>

                          {/* Status */}
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-full border"
                            style={{
                              backgroundColor: `${statusColors[t.status] || '#94A3B8'}15`,
                              borderColor: `${statusColors[t.status] || '#94A3B8'}40`,
                              color: statusColors[t.status] || '#94A3B8'
                            }}
                          >
                            {statusLabels[t.status] || t.status}
                          </span>

                          {/* Due date */}
                          {t.dueDate && (
                            <span
                              className={`text-xs font-bold flex items-center gap-1.5 ${
                                isOverdue ? 'text-rose-600 font-black' : 'text-gray-500'
                              }`}
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>{new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </span>
                          )}

                          <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#0F172A] transition-colors" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Personal Right Column Widgets */}
            <div className="flex flex-col gap-6">
              {/* Quick Jump Spaces */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs">
                <h3 className="text-base font-black text-[#0F172A] mb-3.5 flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-blue-600" />
                  Your Active Spaces
                </h3>
                <div className="flex flex-col gap-2.5">
                  {projects.map((proj: any) => (
                    <button
                      key={proj._id}
                      onClick={() => {
                        if (onSelectProject) {
                           setCurrentProject(proj);
                          onSelectProject(proj);
                        }
                      }}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all text-left cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div
                          className="w-8 h-8 min-w-[32px] min-h-[32px] aspect-square rounded-lg text-white flex items-center justify-center font-black text-xs shrink-0 shadow-2xs"
                          style={{ backgroundColor: proj.color || '#0F172A' }}
                        >
                          {proj.key?.charAt(0)}
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-[#0F172A] truncate group-hover:text-blue-600">
                          {proj.name}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        [{proj.key}]
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* My Recent Activities */}
              <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs flex-1">
                <h3 className="text-base font-black text-[#0F172A] mb-3.5 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-[#22C55E]" />
                  Your Recent Contributions
                </h3>
                <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto">
                  {(personal.recentActivities || []).length === 0 ? (
                    <span className="text-sm text-gray-400 text-center py-6 font-medium">
                      No recent activity recorded.
                    </span>
                  ) : (
                    personal.recentActivities.map((act: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-gray-50 text-xs sm:text-sm text-gray-700">
                        <span className="font-bold text-[#0F172A]">You</span> {act.action || 'updated'}{' '}
                        {act.taskId && (
                          <span className="font-mono font-black text-[#0F172A]">[{act.taskId.key}]</span>
                        )}
                        <span className="text-xs text-gray-400 font-medium block mt-1">
                          {new Date(act.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overdue Tasks & Critical Alerts Modal */}
      <OverdueAlertsModal
        isOpen={isOverdueModalOpen}
        onClose={() => setIsOverdueModalOpen(false)}
        tasks={overdueTasksList}
        onSelectTask={onSelectTask}
        currentUserId={user?._id}
        initialScope={overdueModalScope}
      />
    </div>
  );
};
