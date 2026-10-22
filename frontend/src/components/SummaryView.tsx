'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { SummaryViewSkeleton } from './Skeletons';
import { TimelineTree, TimeframeOption } from './TimelineTree';
import {
  CheckCircle2,
  Edit3,
  PlusCircle,
  Calendar,
  Filter,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Sparkles,
  Layers,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  User,
  Info,
  X,
  Maximize2,
  BarChart2,
  BarChart3,
  Bug,
  BookmarkCheck,
  CheckSquare,
  Flame,
  Zap,
  Users,
  Shield,
  Activity,
  Check,
  PieChart,
  RotateCcw,
  FolderKanban
} from 'lucide-react';

interface SummaryViewProps {
  projectId: string;
  onSelectTask?: (task: any) => void;
  onNavigateTab?: (tab: string) => void;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  projectId,
  onSelectTask,
  onNavigateTab
}) => {
  const { user, projects, currentProject } = useAuthStore();

  // Role resolution
  const userRole = user?.role || 'MEMBER';
  const isOrgAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ORG_ADMIN';
  const isProjectManager = userRole === 'PROJECT_MANAGER' || isOrgAdmin;
  const isTeamLead = userRole === 'TEAM_LEAD' || userRole === 'LEAD';

  // Filters: Scope, Timeframe, Member & Sprint
  const [scopeMode, setScopeMode] = useState<'all' | 'team' | 'personal'>(
    isOrgAdmin || isProjectManager ? 'all' : isTeamLead ? 'team' : 'personal'
  );
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeOption>('30d');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [velocityChartType, setVelocityChartType] = useState<'pie' | 'bar'>('pie');
  const [selectedVelocitySprintIndex, setSelectedVelocitySprintIndex] = useState<number>(0);

  // Helper to calculate SVG pie slice paths
  const createPieSlicePath = (startAngle: number, endAngle: number, r: number, cx = 100, cy = 100) => {
    if (endAngle - startAngle >= 359.9) {
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
    }
    const rad1 = ((startAngle - 90) * Math.PI) / 180;
    const rad2 = ((endAngle - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad1);
    const y1 = cy + r * Math.sin(rad1);
    const x2 = cx + r * Math.cos(rad2);
    const y2 = cy + r * Math.sin(rad2);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  // 1. Fetch Project Details (including teams & members)
  const { data: projectData } = useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  const projectTeams = projectData?.teams || [];

  // 2. Fetch Project Summary Data (metrics, status overview, priority, work types, activity)
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['project-summary', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}/summary`);
      return res.data.data;
    },
    enabled: !!projectId,
    refetchInterval: 12000
  });

  // 3. Fetch Project Teams Progress
  const { data: teamsProgressData } = useQuery({
    queryKey: ['project-teams-progress', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}/teams-progress`);
      return res.data.data;
    },
    enabled: !!projectId,
    refetchInterval: 15000
  });

  // 4. Fetch Sprints
  const { data: sprints = [] } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/sprints`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });

  const activeSprint = sprints.find((s: any) => s.status === 'ACTIVE') || sprints[0];
  const currentSprintId = (selectedSprintId && selectedSprintId !== 'ALL') ? selectedSprintId : activeSprint?._id;

  // Active query parameters based on scope, team and member filters
  const activeTeamQuery = selectedTeam !== 'ALL' ? selectedTeam : undefined;
  const activeAssigneeQuery = selectedMemberId !== 'ALL'
    ? selectedMemberId
    : (scopeMode === 'personal' && user?._id ? user._id : undefined);

  // 5. Fetch Burndown for selected sprint (supports team/personal/member filtering)
  const { data: burndownData, isLoading: isLoadingBurndown } = useQuery({
    queryKey: ['sprint-burndown', projectId, currentSprintId, activeTeamQuery, activeAssigneeQuery],
    queryFn: async () => {
      if (!projectId || !currentSprintId || currentSprintId === 'ALL') return null;
      const params = new URLSearchParams();
      if (activeTeamQuery) params.append('team', activeTeamQuery);
      if (activeAssigneeQuery) params.append('assigneeId', activeAssigneeQuery);

      const res = await api.get(`/projects/${projectId}/sprints/${currentSprintId}/burndown?${params.toString()}`);
      return res.data.data;
    },
    enabled: !!projectId && !!currentSprintId && currentSprintId !== 'ALL'
  });

  // 6. Fetch Velocity metrics (supports team/personal/member filtering)
  const { data: velocityData } = useQuery({
    queryKey: ['project-velocity', projectId, activeTeamQuery, activeAssigneeQuery],
    queryFn: async () => {
      if (!projectId) return null;
      const params = new URLSearchParams();
      if (activeTeamQuery) params.append('team', activeTeamQuery);
      if (activeAssigneeQuery) params.append('assigneeId', activeAssigneeQuery);

      const res = await api.get(`/projects/${projectId}/velocity?${params.toString()}`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // 7. Fetch Project Tasks to build live member capacity metrics
  const { data: projectTasks = [] } = useQuery({
    queryKey: ['project-tasks-analytics', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/tasks?projectId=${projectId}`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });



  const rawMetrics = summaryData?.metrics || {
    completedLast7Days: 0,
    updatedLast7Days: 0,
    createdLast7Days: 0,
    dueSoonNext7Days: 0,
    totalTasks: 0
  };

  const rawStatusOverview = summaryData?.statusOverview || {
    BACKLOG: 0,
    TODO: 0,
    IN_PROGRESS: 0,
    IN_REVIEW: 0,
    DONE: 0
  };

  const rawPriorityBreakdown = summaryData?.priorityBreakdown || {
    URGENT: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    LOWEST: 0
  };

  const rawTypesOfWork = summaryData?.typesOfWork || {
    TASK: 0,
    BUG: 0,
    STORY: 0,
    EPIC: 0
  };

  const recentActivities = summaryData?.recentActivities || [];

  // Timeframe calculation helper
  const now = useMemo(() => new Date(), []);
  const timeframeBoundary = useMemo(() => {
    if (selectedTimeframe === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '1y') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return null;
  }, [selectedTimeframe, now]);

  const effectiveTasks = useMemo(() => {
    return (summaryData?.tasks && summaryData.tasks.length > 0)
      ? summaryData.tasks
      : (projectTasks && projectTasks.length > 0 ? projectTasks : []);
  }, [summaryData?.tasks, projectTasks]);

  // Compute members belonging to currently selected team (or all members if All Teams)
  const visibleMembers = useMemo(() => {
    const allMembers = projectData?.members || [];
    if (selectedTeam === 'ALL') {
      return allMembers;
    }

    const teamObj = projectTeams.find(
      (tm: any) => tm.name?.toLowerCase() === selectedTeam.toLowerCase()
    );

    const teamMemberIdSet = new Set<string>();

    if (teamObj) {
      if (teamObj.leadId) {
        const lid = (teamObj.leadId._id || teamObj.leadId).toString();
        teamMemberIdSet.add(lid);
      }
      (teamObj.members || []).forEach((m: any) => {
        const mid = (m._id || m).toString();
        teamMemberIdSet.add(mid);
      });
    }

    // Also include any member who is assigned tasks in this team
    effectiveTasks.forEach((t: any) => {
      if (t.team && t.team.toLowerCase() === selectedTeam.toLowerCase() && t.assigneeId) {
        const aid = (t.assigneeId._id || t.assigneeId).toString();
        teamMemberIdSet.add(aid);
      }
    });

    const filtered = allMembers.filter((m: any) => {
      const uid = (m.userId?._id || m.userId || m._id)?.toString();
      return uid && teamMemberIdSet.has(uid);
    });

    return filtered;
  }, [projectData?.members, selectedTeam, projectTeams, effectiveTasks]);

  // Handle team change: update team and ensure member is valid
  const handleTeamChange = (teamName: string) => {
    setSelectedTeam(teamName);
    if (teamName !== 'ALL') {
      setScopeMode('team');
      if (selectedMemberId !== 'ALL') {
        const teamObj = projectTeams.find(
          (tm: any) => tm.name?.toLowerCase() === teamName.toLowerCase()
        );
        const teamMemberIdSet = new Set<string>();
        if (teamObj) {
          if (teamObj.leadId) teamMemberIdSet.add((teamObj.leadId._id || teamObj.leadId).toString());
          (teamObj.members || []).forEach((m: any) => teamMemberIdSet.add((m._id || m).toString()));
        }
        effectiveTasks.forEach((t: any) => {
          if (t.team && t.team.toLowerCase() === teamName.toLowerCase() && t.assigneeId) {
            teamMemberIdSet.add((t.assigneeId._id || t.assigneeId).toString());
          }
        });
        if (!teamMemberIdSet.has(selectedMemberId)) {
          setSelectedMemberId('ALL');
        }
      }
    }
  };

  const scopedProjectTasks = useMemo(() => {
    return effectiveTasks.filter((t: any) => {
      // 1. Timeframe
      if (timeframeBoundary) {
        const created = t.createdAt ? new Date(t.createdAt) : null;
        const updated = t.updatedAt ? new Date(t.updatedAt) : null;
        const due = t.dueDate ? new Date(t.dueDate) : null;
        const inRange =
          (created && created >= timeframeBoundary && created <= now) ||
          (updated && updated >= timeframeBoundary && updated <= now) ||
          (due && due >= timeframeBoundary && due <= now);
        if (!inRange) return false;
      }

      // 2. Sprint filter (if a specific sprint is selected)
      if (selectedSprintId && selectedSprintId !== 'ALL') {
        const tSprintId = (t.sprintId?._id || t.sprintId)?.toString();
        const sprintObj = sprints.find((s: any) => s._id === selectedSprintId);
        const matchName = sprintObj?.name && t.sprint === sprintObj.name;
        if (tSprintId !== selectedSprintId && !matchName) return false;
      }

      // 3. Team filter
      if (selectedTeam !== 'ALL') {
        if (!t.team || t.team.toLowerCase() !== selectedTeam.toLowerCase()) return false;
      }

      // 4. Personal scope (Mine)
      if (scopeMode === 'personal' && user?._id) {
        const aid = (t.assigneeId?._id || t.assigneeId)?.toString();
        if (aid !== user._id) return false;
      }

      // 5. Member selector filter
      if (selectedMemberId !== 'ALL') {
        const aid = (t.assigneeId?._id || t.assigneeId)?.toString();
        if (aid !== selectedMemberId) return false;
      }

      return true;
    });
  }, [effectiveTasks, timeframeBoundary, selectedSprintId, selectedTeam, scopeMode, user?._id, selectedMemberId, sprints, now]);

  // Compute Member Workload / Capacity directly from currently filtered/scoped tasks
  const memberWorkloads = useMemo(() => {
    const map = new Map<string, { user: any; total: number; done: number; inProgress: number }>();

    scopedProjectTasks.forEach((t: any) => {
      if (!t.assigneeId) return;
      const uid = t.assigneeId._id || t.assigneeId;
      if (!uid) return;

      if (!map.has(uid)) {
        map.set(uid, {
          user: typeof t.assigneeId === 'object' ? t.assigneeId : { _id: uid, name: 'Member' },
          total: 0,
          done: 0,
          inProgress: 0
        });
      }
      const entry = map.get(uid)!;
      entry.total++;
      if (t.status === 'DONE') entry.done++;
      else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') entry.inProgress++;
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [scopedProjectTasks]);

  const isFiltered =
    selectedTimeframe !== 'ALL' ||
    selectedMemberId !== 'ALL' ||
    selectedTeam !== 'ALL' ||
    scopeMode !== 'all' ||
    (!!selectedSprintId && selectedSprintId !== 'ALL');

  // Dynamic live calculations from scoped tasks
  const dynamicMetrics = useMemo(() => {
    const total = scopedProjectTasks.length;
    const done = scopedProjectTasks.filter((t: any) => t.status === 'DONE').length;
    const inProgress = scopedProjectTasks.filter((t: any) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW').length;
    const overdue = scopedProjectTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE').length;
    const dueSoon = scopedProjectTasks.filter((t: any) => {
      if (!t.dueDate || t.status === 'DONE') return false;
      const due = new Date(t.dueDate);
      const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return due >= now && due <= next7Days;
    }).length;
    const createdInWindow = scopedProjectTasks.filter((t: any) => {
      if (!t.createdAt) return false;
      if (timeframeBoundary) return new Date(t.createdAt) >= timeframeBoundary;
      return true;
    }).length;
    const updatedInWindow = scopedProjectTasks.filter((t: any) => {
      if (!t.updatedAt) return false;
      if (timeframeBoundary) return new Date(t.updatedAt) >= timeframeBoundary;
      return true;
    }).length;

    return {
      completedLast7Days: done,
      updatedLast7Days: updatedInWindow,
      createdLast7Days: createdInWindow,
      dueSoonNext7Days: dueSoon,
      overdueTasks: overdue,
      totalTasks: total
    };
  }, [scopedProjectTasks, now, timeframeBoundary]);

  const dynamicStatusOverview = useMemo(() => {
    const counts: Record<string, number> = { BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 };
    scopedProjectTasks.forEach((t: any) => {
      const s = t.status || 'TODO';
      if (counts[s] !== undefined) counts[s]++;
      else counts.TODO++;
    });
    return counts;
  }, [scopedProjectTasks]);

  const dynamicPriorityBreakdown = useMemo(() => {
    const counts: Record<string, number> = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0, LOWEST: 0 };
    scopedProjectTasks.forEach((t: any) => {
      const p = (t.priority || 'MEDIUM').toUpperCase();
      if (counts[p] !== undefined) counts[p]++;
      else counts.MEDIUM++;
    });
    return counts;
  }, [scopedProjectTasks]);

  const dynamicTypesOfWork = useMemo(() => {
    const counts: Record<string, number> = { TASK: 0, BUG: 0, STORY: 0, EPIC: 0 };
    scopedProjectTasks.forEach((t: any) => {
      const typ = (t.type || 'TASK').toUpperCase();
      if (counts[typ] !== undefined) counts[typ]++;
      else counts.TASK++;
    });
    return counts;
  }, [scopedProjectTasks]);

  // Dynamic live burndown calculated from scoped tasks so charts reflect every filter!
  const dynamicBurndown = useMemo(() => {
    const total = scopedProjectTasks.length;
    const completedTasks = scopedProjectTasks.filter((t: any) => t.status === 'DONE');

    const activeSp = (selectedSprintId && selectedSprintId !== 'ALL')
      ? sprints.find((s: any) => s._id === selectedSprintId)
      : (sprints.find((s: any) => s.status === 'ACTIVE') || sprints[0]);

    const start = new Date(activeSp?.startDate || activeSp?.createdAt || (now.getTime() - 14 * 86400000));
    const end = new Date(activeSp?.endDate || (start.getTime() + 14 * 86400000));
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    const timeline = [];
    const idealDailyBurn = total / totalDays;

    for (let i = 0; i <= totalDays; i++) {
      const currentDate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currentDate.toISOString().split('T')[0];
      const idealRemaining = Math.max(0, Math.round((total - (idealDailyBurn * i)) * 10) / 10);

      let actualRemaining = null;
      if (currentDate <= now || i === 0) {
        const completedUpToDate = completedTasks.filter((t: any) => {
          const compDate = new Date(t.updatedAt || t.createdAt);
          return compDate <= currentDate;
        });
        actualRemaining = Math.max(0, total - completedUpToDate.length);
      }

      timeline.push({
        day: `Day ${i + 1}`,
        date: dateStr,
        ideal: idealRemaining,
        actual: actualRemaining
      });
    }

    return {
      sprintName: (selectedSprintId && selectedSprintId !== 'ALL')
        ? (activeSp?.name || 'Selected Sprint')
        : (activeSp ? `${activeSp.name} (ACTIVE)` : 'All Sprints Scope'),
      totalTasks: total,
      completedTasks: completedTasks.length,
      remainingTasks: Math.max(0, total - completedTasks.length),
      startDate: start,
      endDate: end,
      timeline
    };
  }, [scopedProjectTasks, selectedSprintId, sprints, now]);

  // Dynamic live velocity calculated from scoped tasks across sprints
  const dynamicVelocity = useMemo(() => {
    const totalScope = scopedProjectTasks.length;
    const completed = scopedProjectTasks.filter((t: any) => t.status === 'DONE').length;
    const remaining = Math.max(0, totalScope - completed);
    const completionPct = totalScope > 0 ? Math.min(100, Math.round((completed / totalScope) * 100)) : 0;
    const completedAngle = totalScope > 0 ? (completed / totalScope) * 360 : 0;

    const sprintMap = new Map<string, { sprintId: string; name: string; status: string; committed: number; completed: number }>();

    sprints.forEach((sp: any) => {
      sprintMap.set(sp._id, {
        sprintId: sp._id,
        name: sp.name,
        status: sp.status,
        committed: 0,
        completed: 0
      });
    });

    scopedProjectTasks.forEach((t: any) => {
      const spId = (t.sprintId?._id || t.sprintId)?.toString();
      if (spId && sprintMap.has(spId)) {
        const entry = sprintMap.get(spId)!;
        entry.committed++;
        if (t.status === 'DONE') entry.completed++;
      } else {
        const spByName = sprints.find((s: any) => s.name === t.sprint);
        if (spByName && sprintMap.has(spByName._id)) {
          const entry = sprintMap.get(spByName._id)!;
          entry.committed++;
          if (t.status === 'DONE') entry.completed++;
        }
      }
    });

    const sprintsList = Array.from(sprintMap.values());
    const avgVelocity = sprintsList.length > 0
      ? Math.round(sprintsList.reduce((sum, s) => sum + s.completed, 0) / sprintsList.length)
      : completed;

    return {
      totalScope,
      completed,
      remaining,
      completionPct,
      completedAngle,
      sprints: sprintsList.length > 0 ? sprintsList : [{ sprintId: 'scope', name: 'Current Scope', status: 'ACTIVE', committed: totalScope, completed }],
      averageVelocity: avgVelocity
    };
  }, [scopedProjectTasks, sprints]);

  // Dynamic specialized teams progress calculated from scoped tasks
  const dynamicTeamsProgress = useMemo(() => {
    const rawList = (teamsProgressData?.teams && teamsProgressData.teams.length > 0)
      ? teamsProgressData.teams
      : (projectTeams.length > 0 ? projectTeams : []);

    const computed = rawList.map((team: any) => {
      const teamTasks = scopedProjectTasks.filter((t: any) =>
        t.team && t.team.toLowerCase() === team.name?.toLowerCase()
      );
      const total = teamTasks.length;
      const done = teamTasks.filter((t: any) => t.status === 'DONE').length;
      const inProg = teamTasks.filter((t: any) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW').length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        ...team,
        totalTasks: total,
        completedTasks: done,
        inProgressTasks: inProg,
        completionPercent: pct
      };
    });

    if (selectedTeam !== 'ALL') {
      return computed.filter((tm: any) => tm.name?.toLowerCase() === selectedTeam.toLowerCase());
    }
    return computed;
  }, [teamsProgressData?.teams, projectTeams, scopedProjectTasks, selectedTeam]);

  const filteredActivities = useMemo(() => {
    return recentActivities.filter((act: any) => {
      if (timeframeBoundary) {
        const actDate = act.createdAt ? new Date(act.createdAt) : null;
        if (actDate && actDate < timeframeBoundary) return false;
      }
      if (selectedMemberId !== 'ALL') {
        const uid = (act.userId?._id || act.userId)?.toString();
        if (uid !== selectedMemberId) return false;
      }
      if (selectedTeam !== 'ALL') {
        const taskObj = effectiveTasks.find((t: any) => (t._id || t.id)?.toString() === (act.taskId?._id || act.taskId)?.toString());
        if (taskObj && taskObj.team && taskObj.team.toLowerCase() !== selectedTeam.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  }, [recentActivities, timeframeBoundary, selectedMemberId, selectedTeam, effectiveTasks]);

  // Always use the live dynamic scoped values so all graphs, donuts, and cards react immediately!
  const metrics = dynamicMetrics;
  const statusOverview = dynamicStatusOverview;
  const priorityBreakdown = dynamicPriorityBreakdown;
  const typesOfWork = dynamicTypesOfWork;

  // Calculate SVG Donut Angles
  const total = metrics.totalTasks || 1;
  const todoCount = (statusOverview.TODO || 0) + (statusOverview.BACKLOG || 0);
  const inProgressCount = (statusOverview.IN_PROGRESS || 0) + (statusOverview.IN_REVIEW || 0);
  const doneCount = statusOverview.DONE || 0;

  // Percentage values for Donut
  const todoPct = (todoCount / total) * 100;
  const inProgPct = (inProgressCount / total) * 100;
  const donePct = (doneCount / total) * 100;

  const radius = 70;
  const circumference = 2 * Math.PI * radius;

  // Donut stroke offsets
  const todoOffset = 0;
  const inProgOffset = -((todoPct / 100) * circumference);
  const doneOffset = -(((todoPct + inProgPct) / 100) * circumference);

  // SVG Chart Dimensions for Burndown (always dynamic)
  const timeline = dynamicBurndown.timeline;
  const maxTasks = Math.max(1, dynamicBurndown.totalTasks || 10);
  const chartWidth = 650;
  const chartHeight = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (timeline.length <= 1) return padding.left;
    return padding.left + (index / (timeline.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - (val / maxTasks) * graphHeight;
  };

  // Ideal Line points
  const idealPoints = timeline
    .map((d: any, i: number) => `${getX(i)},${getY(d.ideal)}`)
    .join(' ');

  // Actual Line points
  const actualItems = timeline.filter((d: any) => d.actual !== null);
  const actualPoints = actualItems
    .map((d: any, i: number) => `${getX(i)},${getY(d.actual)}`)
    .join(' ');

  const formatRelativeTime = (dateString: string) => {
    const diffMs = Date.now() - new Date(dateString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `about ${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 bg-white rounded-2xl border border-slate-200 text-center max-w-md mx-auto my-8 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 mb-3">
          <Layers className="w-6 h-6 text-slate-600" />
        </div>
        <h3 className="text-base font-bold text-slate-900">No Project Assigned</h3>
        <p className="text-xs text-slate-500 mt-1">
          You have joined the organization, but have not been assigned to a specific project yet. An administrator or project manager can assign you to a project anytime.
        </p>
      </div>
    );
  }

  if (isLoadingSummary) {
    return <SummaryViewSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6 text-[#111827] max-w-7xl mx-auto select-none pb-8">
      {/* ========================================================================= */}
      {/* 🧭 SCOPE & CONTROLS HEADER BAR (MERGED FROM ANALYTICS)                    */}
      {/* ========================================================================= */}
      <div className="bg-white/95 backdrop-blur-md p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 rounded-xl bg-[#0F172A] text-white shadow-xs">
              <BarChart2 className="w-4 h-4 text-[#22C55E]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#0F172A] tracking-tight">
                  Space Summary & Analytics
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Mission Control
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Consolidated overview of space health, sprint burndown, velocity, and team capacity.
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Timeframe + Member + Scope + Team + Sprint */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Filter Buttons */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
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
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-blue-700 shadow-xs border border-slate-200/50'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tf.label}
                </button>
              );
            })}
          </div>

          {/* 1st: Team Dropdown */}
          <select
            value={selectedTeam}
            onChange={(e) => handleTeamChange(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
          >
            <option value="ALL">👥 All Teams</option>
            {projectTeams.map((tm: any) => (
              <option key={tm._id || tm.name} value={tm.name}>
                {tm.name}
              </option>
            ))}
          </select>

          {/* 2nd: Person / Member Dropdown (shows only selected team's members if a team is selected) */}
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
          >
            <option value="ALL">
              👤 {selectedTeam !== 'ALL' ? `${selectedTeam} Members` : 'All Members'} ({visibleMembers.length})
            </option>
            {visibleMembers.map((m: any) => {
              const u = m.userId || m;
              const uid = (u._id || m._id)?.toString();
              return (
                <option key={uid} value={uid}>
                  👤 {u.name || u.email || 'Member'}
                </option>
              );
            })}
          </select>

          {/* Scope Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => {
                setScopeMode('all');
                setSelectedTeam('ALL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scopeMode === 'all'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌐 All
            </button>
            <button
              onClick={() => setScopeMode('team')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scopeMode === 'team'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👥 Team
            </button>
            <button
              onClick={() => setScopeMode('personal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                scopeMode === 'personal'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👤 Mine
            </button>
          </div>

          {/* Sprint Selector */}
          {sprints.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedSprintId || 'ALL'}
                onChange={(e) => setSelectedSprintId(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 outline-none focus:border-blue-600 cursor-pointer shadow-2xs"
              >
                <option value="ALL">All Sprints & Backlog</option>
                {sprints.map((s: any) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Reset button */}
          {isFiltered && (
            <button
              onClick={() => {
                setSelectedTimeframe('30d');
                setSelectedMemberId('ALL');
                setScopeMode('all');
                setSelectedTeam('ALL');
                setSelectedSprintId('ALL');
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer"
              title="Reset filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 5 KEY METRIC KPI CARDS ROW                                             */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        {/* Card 1: Completed */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 hover:border-emerald-500 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs transition-all">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">
              {metrics.completedLast7Days} completed
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {selectedTimeframe === '24h' ? 'past 24 hours' : selectedTimeframe === '7d' ? 'last 7 days' : selectedTimeframe === '30d' ? 'last 30 days' : selectedTimeframe === '1y' ? 'last 1 year' : 'all time'}
            </div>
          </div>
        </div>

        {/* Card 2: Total / Active in Scope */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 hover:border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs transition-all">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center border border-slate-200 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">
              {metrics.totalTasks} total tasks
            </div>
            <div className="text-[11px] text-slate-500 font-medium">in current scope</div>
          </div>
        </div>

        {/* Card 3: Created */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 hover:border-blue-500 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs transition-all">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 shrink-0">
            <PlusCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">
              {metrics.createdLast7Days} created
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {selectedTimeframe === '24h' ? 'past 24h' : 'selected window'}
            </div>
          </div>
        </div>

        {/* Card 4: Due Soon / Overdue */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 hover:border-amber-500 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs transition-all">
          <div className={`w-10 h-10 rounded-xl ${(metrics as any).overdueTasks > 0 ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-amber-50 text-amber-600 border border-amber-200'} flex items-center justify-center shrink-0`}>
            {(metrics as any).overdueTasks > 0 ? (
              <AlertCircle className="w-5 h-5 text-rose-500" />
            ) : (
              <Calendar className="w-5 h-5" />
            )}
          </div>
          <div>
            <div className={`text-sm font-black ${(metrics as any).overdueTasks > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {(metrics as any).overdueTasks > 0 ? `${(metrics as any).overdueTasks} overdue` : `${metrics.dueSoonNext7Days} due soon`}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {(metrics as any).overdueTasks > 0 ? 'requires action' : 'next 7 days'}
            </div>
          </div>
        </div>

        {/* Card 5: Velocity / Total Work */}
        <div className="bg-white/95 backdrop-blur-md border border-slate-200 hover:border-purple-500 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs transition-all col-span-2 sm:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">
              {dynamicVelocity.averageVelocity} avg velocity
            </div>
            <div className="text-[11px] text-slate-500 font-medium">tasks per sprint</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📈 MAJOR CHARTS: SPRINT BURNDOWN & SPRINT VELOCITY                        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Sprint Burndown SVG Chart */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <span>Sprint Burndown</span>
                  <span className="text-xs text-slate-400 font-normal">
                    ({dynamicBurndown.sprintName})
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Ideal guideline vs. actual tasks remaining
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-slate-400 border-b border-dashed" />
                  <span className="text-slate-500 text-[11px] font-medium">Ideal Burn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-emerald-500 rounded-full" />
                  <span className="text-slate-900 text-[11px] font-bold">Actual Burn</span>
                </div>
              </div>
            </div>

            {/* SVG Visualizer */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto min-w-[480px]"
              >
                {/* Horizontal Grid Lines & Y-Axis Labels */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = padding.top + graphHeight * (1 - ratio);
                  const tasksVal = Math.round(maxTasks * ratio);
                  return (
                    <g key={idx}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={chartWidth - padding.right}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#94A3B8"
                        fontWeight="600"
                      >
                        {tasksVal}
                      </text>
                    </g>
                  );
                })}

                {/* X-Axis Labels */}
                {timeline.map((d: any, idx: number) => {
                  if (idx % Math.ceil(timeline.length / 7) === 0 || idx === timeline.length - 1) {
                    const x = getX(idx);
                    return (
                      <text
                        key={idx}
                        x={x}
                        y={chartHeight - 12}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#64748B"
                        fontWeight="600"
                      >
                        {d.day}
                      </text>
                    );
                  }
                  return null;
                })}

                {/* Ideal Line (Dashed Slate) */}
                {idealPoints && (
                  <polyline
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                    points={idealPoints}
                  />
                )}

                {/* Actual Line (Solid Emerald) */}
                {actualPoints && (
                  <>
                    <polyline
                      fill="none"
                      stroke="#10B981"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={actualPoints}
                    />
                    {actualItems.map((d: any, idx: number) => (
                      <circle
                        key={idx}
                        cx={getX(idx)}
                        cy={getY(d.actual)}
                        r="4.5"
                        fill="#0F172A"
                        stroke="#10B981"
                        strokeWidth="2.5"
                      />
                    ))}
                  </>
                )}
              </svg>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Remaining: <strong className="text-slate-800">{dynamicBurndown.remainingTasks} tasks</strong></span>
            <span>Total Sprint Scope: <strong className="text-slate-800">{dynamicBurndown.totalTasks} tasks</strong></span>
            <span>Sprint Ends: <strong className="text-slate-800">{new Date(dynamicBurndown.endDate).toLocaleDateString()}</strong></span>
          </div>
        </div>

        {/* Chart 2: Velocity Chart (Pie / Bar toggle) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-purple-600" />
                  <span>Sprint Velocity Chart</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Committed vs. Completed tasks across sprint history
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* View Mode Toggle: Pie vs Bar */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setVelocityChartType('pie')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                      velocityChartType === 'pie'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="View as Pie Chart"
                  >
                    <PieChart className="w-3 h-3" />
                    <span>Pie</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVelocityChartType('bar')}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                      velocityChartType === 'bar'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="View as Bar Chart"
                  >
                    <BarChart2 className="w-3 h-3" />
                    <span>Bars</span>
                  </button>
                </div>

                {/* Sprints dropdown if multiple sprints */}
                {(dynamicVelocity?.sprints || []).length > 1 && velocityChartType === 'pie' && (
                  <select
                    value={selectedVelocitySprintIndex}
                    onChange={(e) => setSelectedVelocitySprintIndex(Number(e.target.value))}
                    className="text-[11px] font-medium bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    {dynamicVelocity.sprints.map((s: any, idx: number) => (
                      <option key={idx} value={idx}>{s.name || `Sprint ${idx + 1}`}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Visualizer Body */}
            {velocityChartType === 'pie' ? (
              // 🥧 PIE / DONUT CHART VIEW
              (() => {
                const sprints = dynamicVelocity?.sprints || [];
                if (sprints.length === 0) {
                  return (
                    <div className="w-full h-56 flex flex-col items-center justify-center text-xs text-slate-400 italic border-b border-slate-100">
                      <PieChart className="w-8 h-8 text-slate-300 mb-2 stroke-1" />
                      <span>No sprint velocity data recorded yet</span>
                    </div>
                  );
                }

                const currentSprint = sprints[selectedVelocitySprintIndex] || sprints[0];
                const committed = Number(currentSprint?.committed || dynamicVelocity.totalScope || 0);
                const completed = Number(currentSprint?.completed || dynamicVelocity.completed || 0);
                const remaining = Math.max(0, committed - completed);
                const totalScope = Math.max(committed, completed, 1);
                const completionPct = totalScope > 0 ? Math.min(100, Math.round((completed / totalScope) * 100)) : 0;
                const completedAngle = totalScope > 0 ? (completed / totalScope) * 360 : 0;

                return (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 min-h-[240px] sm:h-64 px-4 border-b border-slate-100 pb-4">
                    {/* SVG Donut / Pie Slice - Enchanced & Enlarged */}
                    <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90 filter drop-shadow-xs">
                        {completed === 0 ? (
                          // 0% Completed: Full remaining circle
                          <circle cx="100" cy="100" r="82" fill="#CBD5E1" />
                        ) : completed >= totalScope ? (
                          // 100% Completed: Full blue circle
                          <circle cx="100" cy="100" r="82" fill="#2563EB" />
                        ) : (
                          // Partial: Completed slice + Remaining slice
                          <g>
                            <path
                              d={createPieSlicePath(0, completedAngle, 82, 100, 100)}
                              fill="#2563EB"
                              className="transition-all duration-500 hover:opacity-95"
                            />
                            <path
                              d={createPieSlicePath(completedAngle, 360, 82, 100, 100)}
                              fill="#CBD5E1"
                              className="transition-all duration-500 hover:opacity-95"
                            />
                          </g>
                        )}
                        {/* Donut cutout hole */}
                        <circle cx="100" cy="100" r="50" fill="#FFFFFF" />
                        <circle cx="100" cy="100" r="50" fill="none" stroke="#F1F5F9" strokeWidth="2.5" />
                      </svg>

                      {/* Donut Center Metrics */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-3xl sm:text-4xl font-black text-slate-900 leading-none tracking-tight">
                          {completionPct}%
                        </span>
                        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mt-1">
                          DONE
                        </span>
                      </div>
                    </div>

                    {/* Stats Legend Breakdown */}
                    <div className="flex flex-col justify-center gap-3.5 min-w-[210px] sm:min-w-[240px]">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="text-sm font-bold text-slate-900">
                          {currentSprint.name || `Sprint ${selectedVelocitySprintIndex + 1}`}
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          completionPct >= 100
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {completionPct >= 100 ? 'Target Met ✨' : 'In Progress'}
                        </span>
                      </div>

                      {/* Completed */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-blue-600 shadow-xs shrink-0" />
                          <span className="text-slate-800 font-semibold">Completed</span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-900 text-base">{completed}</span>
                          <span className="text-xs font-semibold text-slate-400 ml-1.5">({completionPct}%)</span>
                        </div>
                      </div>

                      {/* Committed / Remaining */}
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5">
                          <span className="w-3.5 h-3.5 rounded-full bg-slate-300 shrink-0" />
                          <span className="text-slate-600 font-medium">Remaining</span>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-800 text-base">{remaining}</span>
                          <span className="text-xs font-semibold text-slate-400 ml-1.5">({100 - completionPct}%)</span>
                        </div>
                      </div>

                      {/* Total Scope */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span className="font-medium">Total Scope</span>
                        <span className="font-bold text-slate-900 text-sm">{committed || completed} tasks</span>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              // 📊 BAR CHART VIEW (Classic comparison across all sprints)
              <div className="flex items-end justify-between gap-4 h-56 pt-6 px-4 border-b border-slate-200 pb-2">
                {(dynamicVelocity?.sprints || []).length === 0 ? (
                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 italic">
                    No previous sprint history recorded yet
                  </div>
                ) : (
                  (dynamicVelocity?.sprints || []).map((sprint: any, idx: number) => {
                    const maxVal = Math.max(1, ...dynamicVelocity.sprints.map((s: any) => Math.max(s.committed, s.completed)));
                    const committedHeight = (sprint.committed / maxVal) * 100;
                    const completedHeight = (sprint.completed / maxVal) * 100;

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        <div className="flex items-end gap-1.5 w-full justify-center h-full">
                          {/* Committed Bar */}
                          <div
                            style={{ height: `${Math.max(8, committedHeight)}%` }}
                            className="w-4 sm:w-6 bg-slate-200 hover:bg-slate-300 rounded-t-md transition-all relative cursor-pointer"
                            title={`Committed: ${sprint.committed} tasks`}
                          >
                            <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-700 bg-white px-1 rounded shadow-xs border border-slate-200">
                              {sprint.committed}
                            </span>
                          </div>

                          {/* Completed Bar */}
                          <div
                            style={{ height: `${Math.max(8, completedHeight)}%` }}
                            className="w-4 sm:w-6 bg-blue-600 hover:bg-blue-700 rounded-t-md transition-all relative cursor-pointer"
                            title={`Completed: ${sprint.completed} tasks`}
                          >
                            <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white bg-blue-700 px-1 rounded shadow-xs">
                              {sprint.completed}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] font-bold text-slate-600 truncate max-w-[70px] text-center">
                          {sprint.name}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Average Velocity: <strong className="text-purple-700 font-bold">{dynamicVelocity?.averageVelocity || 0} tasks</strong></span>
            <span>Recorded Sprints: <strong className="text-slate-800">{dynamicVelocity?.sprints?.length || 0}</strong></span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 STATUS DONUT CHART & RECENT ACTIVITY STREAM                           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Overview Card with Circular Donut Chart */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Status Overview</h3>
              <button
                onClick={() => onNavigateTab?.('board')}
                className="text-xs text-blue-600 hover:underline font-bold cursor-pointer"
              >
                View Kanban Board
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-6">
              Distribution of work items across stages.
            </p>

            {/* Circular Donut Visual */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-2">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-44 h-44 -rotate-90 transform" viewBox="0 0 180 180">
                  {/* Background Track */}
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    stroke="#F1F5F9"
                    strokeWidth="22"
                    fill="transparent"
                  />
                  {/* To Do (Navy) */}
                  {todoPct > 0 && (
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      stroke="#0F172A"
                      strokeWidth="22"
                      fill="transparent"
                      strokeDasharray={`${(todoPct / 100) * circumference} ${circumference}`}
                      strokeDashoffset={todoOffset}
                      strokeLinecap="round"
                    />
                  )}
                  {/* In Progress (Amber) */}
                  {inProgPct > 0 && (
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      stroke="#F59E0B"
                      strokeWidth="22"
                      fill="transparent"
                      strokeDasharray={`${(inProgPct / 100) * circumference} ${circumference}`}
                      strokeDashoffset={inProgOffset}
                      strokeLinecap="round"
                    />
                  )}
                  {/* Done (Green) */}
                  {donePct > 0 && (
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      stroke="#10B981"
                      strokeWidth="22"
                      fill="transparent"
                      strokeDasharray={`${(donePct / 100) * circumference} ${circumference}`}
                      strokeDashoffset={doneOffset}
                      strokeLinecap="round"
                    />
                  )}
                </svg>

                {/* Center Content */}
                <div className="absolute flex flex-col items-center justify-center text-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-900">{metrics.totalTasks}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Total Issues
                  </span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-3 text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#0F172A] shrink-0" />
                  <span className="text-slate-600">To Do:</span>
                  <strong className="text-slate-900 ml-auto">{todoCount}</strong>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#F59E0B] shrink-0" />
                  <span className="text-slate-600">In Progress / Review:</span>
                  <strong className="text-slate-900 ml-auto">{inProgressCount}</strong>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded bg-[#10B981] shrink-0" />
                  <span className="text-slate-600">Done:</span>
                  <strong className="text-slate-900 ml-auto">{doneCount}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Overall Space Completion</span>
            <span className="font-bold text-emerald-600">
              {metrics.totalTasks > 0 ? Math.round((doneCount / metrics.totalTasks) * 100) : 0}%
            </span>
          </div>
        </div>

        {/* Member Workload & Capacity Matrix (Merged from Analytics) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Member Workload Matrix</span>
              </h3>
              <span className="text-[11px] font-bold text-slate-400">
                {memberWorkloads.length} Members
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Active assignments and completion breakdown by individual.
            </p>

            <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto pr-1">
              {memberWorkloads.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  No member task assignments in this space yet.
                </div>
              ) : (
                memberWorkloads.map((mw) => {
                  const compPct = mw.total > 0 ? Math.round((mw.done / mw.total) * 100) : 0;
                  return (
                    <div
                      key={mw.user._id || mw.user.name}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs shrink-0">
                          {mw.user.name?.charAt(0) || 'U'}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                            {mw.user.name || 'Member'}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {mw.inProgress} active · {mw.done} done
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-20 hidden sm:block">
                          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${compPct}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-700 min-w-[32px] text-right">
                          {compPct}%
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          {mw.total}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Assigned Tasks</span>
            <span className="font-bold text-slate-800">
              {memberWorkloads.reduce((acc, m) => acc + m.total, 0)} total
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 SPECIALIZED TEAMS PROGRESS MATRIX                                      */}
      {/* ========================================================================= */}
      {dynamicTeamsProgress && dynamicTeamsProgress.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Specialized Teams Capacity & Progress</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time milestone completion percentages across specialized teams in this space.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab?.('teams')}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>View Teams Matrix</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {dynamicTeamsProgress.map((team: any) => (
              <div
                key={team._id}
                onClick={() => onNavigateTab?.('teams')}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 truncate">{team.name}</span>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: team.color || '#3B82F6' }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span className="text-slate-500 font-medium text-[11px]">{team.completedTasks}/{team.totalTasks} done</span>
                    <span
                      className="font-mono"
                      style={{
                        color: team.completionPercent > 70 ? '#16A34A' : team.completionPercent > 30 ? '#D97706' : '#2563EB'
                      }}
                    >
                      {team.completionPercent}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${team.completionPercent}%`,
                        backgroundColor:
                          team.completionPercent > 70
                            ? '#10B981'
                            : team.completionPercent > 30
                            ? '#F59E0B'
                            : '#2563EB'
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                  <span>Lead: {team.lead?.name || 'Unassigned'}</span>
                  {team.inProgressTasks > 0 && (
                    <span className="font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                      {team.inProgressTasks} WIP
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🌲 HIERARCHICAL TIMELINE TREE & ROADMAP                                   */}
      {/* ========================================================================= */}
      <TimelineTree
        tasks={scopedProjectTasks}
        projects={currentProject ? [currentProject] : []}
        sprints={sprints}
        teams={projectTeams}
        members={projectData?.members || []}
        title="Project Timeline & Hierarchical Roadmap"
        subtitle={`Milestone schedules, active sprints, and task execution progress for ${projectData?.name || 'this space'}`}
        selectedProjectId={projectId}
        selectedMemberId={selectedMemberId}
        selectedTimeframe={selectedTimeframe}
        onTimeframeChange={setSelectedTimeframe}
        onMemberChange={setSelectedMemberId}
        onSelectTask={onSelectTask}
      />

      {/* ========================================================================= */}
      {/* 📊 PRIORITY BREAKDOWN, TYPES OF WORK, & RECENT ACTIVITY STREAM             */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-1">Priority Breakdown</h3>
          <p className="text-xs text-slate-500 mb-4">Distribution of tasks by urgency level.</p>

          <div className="flex flex-col gap-3 text-xs">
            {Object.entries(priorityBreakdown).map(([prio, count]: any) => (
              <div key={prio} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-600">{prio}</span>
                  <span className="text-slate-900 font-bold">{count}</span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      prio === 'URGENT'
                        ? 'bg-rose-500'
                        : prio === 'HIGH'
                        ? 'bg-amber-500'
                        : prio === 'MEDIUM'
                        ? 'bg-blue-600'
                        : 'bg-slate-400'
                    }`}
                    style={{
                      width: `${metrics.totalTasks > 0 ? (count / metrics.totalTasks) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Types of Work */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-1">Types of Work</h3>
          <p className="text-xs text-slate-500 mb-4">Categorization across tasks, bugs, stories and epics.</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <CheckSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-900">{typesOfWork.TASK || 0}</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Tasks</div>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Bug className="w-4 h-4" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-900">{typesOfWork.BUG || 0}</div>
                <div className="text-[10px] text-rose-700 font-bold uppercase">Bugs</div>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <BookmarkCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-900">{typesOfWork.STORY || 0}</div>
                <div className="text-[10px] text-emerald-700 font-bold uppercase">Stories</div>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <div className="text-base font-extrabold text-slate-900">{typesOfWork.EPIC || 0}</div>
                <div className="text-[10px] text-purple-700 font-bold uppercase">Epics</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Stream */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Recent Activity</span>
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase">Live Stream</span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Real-time audit events across this space.
          </p>

          <div className="flex-1 overflow-y-auto max-h-56 flex flex-col gap-2.5 pr-1">
            {filteredActivities.length > 0 ? (
              filteredActivities.map((act: any) => (
                <div
                  key={act._id}
                  className="flex items-start gap-2.5 p-2 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                    {act.userId?.name ? act.userId.name.charAt(0) : 'U'}
                  </div>

                  <div className="flex-1 min-w-0 text-xs">
                    <div className="text-slate-800 leading-snug">
                      <strong className="font-bold text-slate-900">{act.userId?.name || 'User'}</strong>{' '}
                      {act.action === 'CREATED' && 'created task'}
                      {act.action === 'STATUS_CHANGED' && (
                        <span>
                          updated status to <span className="font-bold text-blue-700">{act.newValue}</span>
                        </span>
                      )}
                      {act.action === 'ASSIGNED' && 'assigned task'}
                      {act.action !== 'CREATED' &&
                        act.action !== 'STATUS_CHANGED' &&
                        act.action !== 'ASSIGNED' &&
                        act.action.toLowerCase()}{' '}
                      {act.taskId && (
                        <span
                          onClick={() => onSelectTask?.(act.taskId)}
                          className="font-mono font-bold text-blue-600 hover:underline cursor-pointer ml-1"
                        >
                          [{act.taskId.key}]
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {formatRelativeTime(act.createdAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No recent activity recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
