'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Play,
  CheckCheck,
  MoreHorizontal,
  Flame,
  Zap,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle2,
  Bug,
  BookmarkCheck,
  CheckSquare,
  GripVertical,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Pencil,
  Check,
  X,
  CornerDownRight,
  Sparkles,
  Lock
} from 'lucide-react';
import { BacklogSprintSkeleton } from './Skeletons';
import { ExcelImportModal } from './ExcelImportModal';
import { downloadProjectExcel } from '../lib/excelExport';

export const LEVEL_THEMES = {
  MAIN: {
    accentColor: '#4F46E5', // Indigo
    badgeBg: '#EEF2FF',
    badgeText: '#3730A3',
    badgeBorder: '#C7D2FE',
    label: 'MAIN TASK'
  },
  SUBTASK: {
    accentColor: '#0284C7', // Sky Blue
    badgeBg: '#F0F9FF',
    badgeText: '#075985',
    badgeBorder: '#BAE6FD',
    label: 'SUBTASK'
  },
  MINITASK: {
    accentColor: '#D97706', // Amber
    badgeBg: '#FFFBEB',
    badgeText: '#92400E',
    badgeBorder: '#FDE68A',
    label: 'MINI-TASK'
  },
  MICROTASK: {
    accentColor: '#059669', // Emerald
    badgeBg: '#ECFDF5',
    badgeText: '#065F46',
    badgeBorder: '#A7F3D0',
    label: 'MICRO-TASK'
  }
};

interface BacklogViewProps {
  projectId: string;
  onSelectTask: (task: any, context?: { targetSubtaskId?: string; targetMicrotaskId?: string; targetMinitaskId?: string }) => void;
  onOpenCreateTask: (status?: string, team?: string, sprintId?: string) => void;
}

export const BacklogView: React.FC<BacklogViewProps> = ({
  projectId,
  onSelectTask,
  onOpenCreateTask
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const currentUserIdStr = ((user as any)?._id || user?.id)?.toString();
  const [collapsedSprints, setCollapsedSprints] = useState<Record<string, boolean>>({});
  const [inlineTaskTitles, setInlineTaskTitles] = useState<Record<string, string>>({});
  const [activeInlineSprintId, setActiveInlineSprintId] = useState<string | null>(null);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [editingSprintName, setEditingSprintName] = useState<string>('');
  const [expandedMainTasks, setExpandedMainTasks] = useState<Record<string, boolean>>({});
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});
  const [expandedMinitasks, setExpandedMinitasks] = useState<Record<string, boolean>>({});

  const handleExportToExcel = async () => {
    try {
      setIsExportingExcel(true);
      await downloadProjectExcel({
        projectId,
        projectKey: projectDetail?.key || 'PRJ',
        scope: 'all',
        startTaskNumber: 1
      });
    } catch (err) {
      console.error('Failed to export backlog tasks to Excel:', err);
      alert('Failed to export tasks to Excel. Please check your network connection.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Fetch Project Detail for lead & permission check
  const { data: projectDetail } = useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // Fetch Project Teams
  const { data: projectTeams = [] } = useQuery({
    queryKey: ['project-teams', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/teams`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });

  const isLevel1 = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isLevel2 =
    user?.role === 'PROJECT_MANAGER' ||
    (projectDetail?.leadId && (projectDetail.leadId._id || projectDetail.leadId)?.toString() === currentUserIdStr);
  const isGuest = user?.role === 'GUEST' || user?.role === 'VIEWER';

  const userLeadTeamNames = React.useMemo(() => {
    const names = new Set<string>();
    if (projectTeams && Array.isArray(projectTeams)) {
      projectTeams.forEach((pt: any) => {
        const leadId = pt.leadId?._id || pt.leadId;
        if (leadId && leadId.toString() === currentUserIdStr) {
          if (pt.name) names.add(pt.name.toLowerCase().trim());
          if (pt.key) names.add(pt.key.toLowerCase().trim());
        }
      });
    }
    return names;
  }, [projectTeams, currentUserIdStr]);

  const isLevel3 = user?.role === 'TEAM_LEAD' || userLeadTeamNames.size > 0;
  const canManageSprint = isLevel1 || isLevel2;
  const canImportExcel = isLevel1 || isLevel2 || isLevel3; // 1st 3 levels only
  const canCreateTask = !isGuest && (isLevel1 || isLevel2 || (isLevel3 && userLeadTeamNames.size > 0));
  const leadTeamToPass = isLevel3 && !isLevel1 && !isLevel2 ? Array.from(userLeadTeamNames)[0] : undefined;

  // Fetch Sprints
  const { data: sprints = [], isLoading: isLoadingSprints } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/sprints`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // Fetch All Tasks for Backlog View
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['project-all-tasks', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/tasks?projectId=${projectId}&limit=100`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // Start Sprint Mutation
  const startSprintMutation = useMutation({
    mutationFn: async (sprintId: string) => {
      const res = await api.patch(`/projects/${projectId}/sprints/${sprintId}/start`, {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  // Complete Sprint Mutation
  const completeSprintMutation = useMutation({
    mutationFn: async (sprintId: string) => {
      const res = await api.patch(`/projects/${projectId}/sprints/${sprintId}/complete`, {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  // Rename Sprint Mutation
  const renameSprintMutation = useMutation({
    mutationFn: async ({ sprintId, newName }: { sprintId: string; newName: string }) => {
      const res = await api.put(`/projects/${projectId}/sprints/${sprintId}`, {
        name: newName.trim()
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setEditingSprintId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to rename sprint');
    }
  });

  // Quick Create Inline Task Mutation
  const quickCreateMutation = useMutation({
    mutationFn: async ({ title, sprintId, sprintName }: { title: string; sprintId?: string; sprintName?: string }) => {
      const res = await api.post('/tasks', {
        projectId,
        title,
        status: 'TODO',
        sprintId: sprintId || null,
        sprint: sprintName || 'Backlog'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      setInlineTaskTitles({});
      setActiveInlineSprintId(null);
    }
  });

  // Create New Sprint Mutation
  const createSprintMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/projects/${projectId}/sprints`, {
        name: `Sprint ${sprints.length + 1}`,
        status: 'PLANNED'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
    }
  });

  const toggleCollapse = (id: string) => {
    setCollapsedSprints((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'BUG':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded shadow-2xs">
            <Bug className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>BUG</span>
          </span>
        );
      case 'EPIC':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded shadow-2xs">
            <Layers className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>EPIC</span>
          </span>
        );
      case 'STORY':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 px-1.5 py-0.5 rounded shadow-2xs">
            <BookmarkCheck className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>STORY</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0F172A] bg-[#0F172A]/10 border border-[#0F172A]/20 px-1.5 py-0.5 rounded shadow-2xs">
            <CheckSquare className="w-2.5 h-2.5 stroke-[2.5]" />
            <span>TASK</span>
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="text-[10px] font-bold text-rose-600">Urgent</span>;
      case 'HIGH':
        return <span className="text-[10px] font-bold text-[#F59E0B]">High</span>;
      case 'MEDIUM':
        return <span className="text-[10px] font-medium text-[#0F172A]">Medium</span>;
      default:
        return <span className="text-[10px] font-medium text-[#111827]/50">Low</span>;
    }
  };

  if (isLoadingSprints || isLoadingTasks) {
    return <BacklogSprintSkeleton />;
  }

  // Group tasks by sprint
  const tasksBySprint: Record<string, any[]> = { backlog: [] };
  sprints.forEach((s: any) => {
    tasksBySprint[s._id] = [];
  });

  allTasks.forEach((t: any) => {
    const sId = t.sprintId?._id || t.sprintId;
    if (sId && tasksBySprint[sId]) {
      tasksBySprint[sId].push(t);
    } else {
      // Find matching sprint by name
      const matching = sprints.find((s: any) => s.name === t.sprint);
      if (matching && tasksBySprint[matching._id]) {
        tasksBySprint[matching._id].push(t);
      } else {
        tasksBySprint.backlog.push(t);
      }
    }
  });

  const renderTaskTree = (task: any) => {
    const isMainExpanded = !!expandedMainTasks[task._id];
    const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
    const hasSubtasks = subtasks.length > 0;

    return (
      <div key={task._id} className="flex flex-col border-b border-slate-200/60 last:border-b-0">
        {/* Level 1: Main Task Row */}
        <div
          onClick={() => onSelectTask(task)}
          className="px-3.5 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3 cursor-pointer transition-colors group border-l-4"
          style={{ borderLeftColor: LEVEL_THEMES.MAIN.accentColor }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Main Task Accordion Dropdown Button */}
            {hasSubtasks ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedMainTasks((prev) => ({ ...prev, [task._id]: !prev[task._id] }));
                }}
                className="p-1 hover:bg-slate-200/80 rounded text-slate-500 hover:text-indigo-700 transition-colors cursor-pointer"
                title={isMainExpanded ? "Collapse subtasks" : "Expand subtasks"}
              >
                {isMainExpanded ? (
                  <ChevronDown className="w-4 h-4 text-indigo-700" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                )}
              </button>
            ) : (
              <span className="w-6 h-6 flex items-center justify-center text-slate-300">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </span>
            )}

            <div className="opacity-0 group-hover:opacity-70 text-gray-400 hover:text-[#0F172A] transition-opacity cursor-grab active:cursor-grabbing -ml-1">
              <GripVertical className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>

            {/* Level 1 Badge: MAIN TASK */}
            <span
              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs shrink-0"
              style={{
                backgroundColor: LEVEL_THEMES.MAIN.badgeBg,
                color: LEVEL_THEMES.MAIN.badgeText,
                borderColor: LEVEL_THEMES.MAIN.badgeBorder
              }}
            >
              <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
              <span>MAIN</span>
            </span>

            {getTypeBadge(task.issueType)}

            <span className="font-mono text-xs font-bold text-slate-800 group-hover:text-indigo-600 group-hover:underline shrink-0">
              {task.key}
            </span>

            <span className="text-xs font-semibold text-slate-900 truncate">
              {task.title}
            </span>

            {/* Subtasks Count Tag */}
            {hasSubtasks && (
              <button
                type="button"
                className="text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: LEVEL_THEMES.SUBTASK.badgeBg,
                  color: LEVEL_THEMES.SUBTASK.badgeText,
                  borderColor: LEVEL_THEMES.SUBTASK.badgeBorder
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedMainTasks((prev) => ({ ...prev, [task._id]: !prev[task._id] }));
                }}
              >
                <span>{subtasks.length} Subtasks</span>
              </button>
            )}

            {task.isLocked && (
              <span
                className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0"
                title={`Locked by ${task.lockedBy?.name || 'Lead'}`}
              >
                <Lock className="w-3 h-3 text-amber-600" />
                <span>Locked</span>
              </span>
            )}

            {task.labels && task.labels.length > 0 && (
              <div className="hidden sm:flex items-center gap-1">
                {task.labels.slice(0, 2).map((l: string, idx: number) => (
                  <span key={idx} className="text-[9px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    #{l}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {getPriorityBadge(task.priority)}
            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {task.status}
            </span>
            {task.assigneeId ? (
              <div
                title={`Assigned to ${task.assigneeId.name}`}
                className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"
              >
                <div className="w-4 h-4 rounded-full bg-indigo-700 text-white flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
                  {task.assigneeId.name?.charAt(0)}
                </div>
                <span className="text-[10px] font-semibold text-slate-800 truncate max-w-[90px]">
                  {task.assigneeId.name}
                </span>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] border border-slate-200">
                -
              </div>
            )}
          </div>
        </div>

        {/* Level 2: Subtasks (Rendered when Main Task is expanded) */}
        {isMainExpanded && hasSubtasks && (
          <div className="flex flex-col bg-sky-50/20 divide-y divide-sky-100/50">
            {subtasks.map((st: any) => {
              const isSubExpanded = !!expandedSubtasks[st._id];
              const minitasks = Array.isArray(st.minitasks) ? st.minitasks : [];
              const hasMinitasks = minitasks.length > 0;

              return (
                <div key={st._id} className="flex flex-col">
                  {/* Subtask Row */}
                  <div
                    onClick={() => onSelectTask(task, { targetSubtaskId: st._id })}
                    className="pl-8 pr-3.5 py-2 hover:bg-sky-50/60 flex items-center justify-between gap-3 cursor-pointer transition-colors group border-l-4"
                    style={{ borderLeftColor: LEVEL_THEMES.SUBTASK.accentColor }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CornerDownRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />

                      {/* Subtask Dropdown Toggle */}
                      {hasMinitasks ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSubtasks((prev) => ({ ...prev, [st._id]: !prev[st._id] }));
                          }}
                          className="p-1 hover:bg-sky-100 rounded text-sky-700 transition-colors cursor-pointer"
                          title={isSubExpanded ? "Collapse mini-tasks" : "Expand mini-tasks"}
                        >
                          {isSubExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-sky-700" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-sky-500" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 h-5 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-sky-300" />
                        </span>
                      )}

                      {/* Level 2 Badge: SUBTASK */}
                      <span
                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs shrink-0"
                        style={{
                          backgroundColor: LEVEL_THEMES.SUBTASK.badgeBg,
                          color: LEVEL_THEMES.SUBTASK.badgeText,
                          borderColor: LEVEL_THEMES.SUBTASK.badgeBorder
                        }}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-sky-600" />
                        <span>SUBTASK</span>
                      </span>

                      {st.key && (
                        <span className="font-mono text-xs font-bold text-sky-900 bg-sky-100/70 px-1.5 py-0.5 rounded border border-sky-200 shrink-0">
                          {st.key}
                        </span>
                      )}

                      <span className="text-xs font-semibold text-slate-800 truncate">
                        {st.title}
                      </span>

                      {st.isLocked && (
                        <span
                          className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0"
                          title={`Locked by ${st.lockedBy?.name || 'Lead'}`}
                        >
                          <Lock className="w-2.5 h-2.5 text-rose-600" />
                          <span>Locked</span>
                        </span>
                      )}

                      {/* Mini-tasks Count Tag */}
                      {hasMinitasks && (
                        <button
                          type="button"
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{
                            backgroundColor: LEVEL_THEMES.MINITASK.badgeBg,
                            color: LEVEL_THEMES.MINITASK.badgeText,
                            borderColor: LEVEL_THEMES.MINITASK.badgeBorder
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSubtasks((prev) => ({ ...prev, [st._id]: !prev[st._id] }));
                          }}
                        >
                          <span>{minitasks.length} Mini-tasks</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{
                        backgroundColor: LEVEL_THEMES.SUBTASK.badgeBg,
                        color: LEVEL_THEMES.SUBTASK.badgeText,
                        borderColor: LEVEL_THEMES.SUBTASK.badgeBorder
                      }}>
                        {st.status || 'TODO'}
                      </span>

                      {st.assigneeId ? (
                        <div
                          title={`Assigned to ${st.assigneeId.name}`}
                          className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full"
                        >
                          <div className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
                            {st.assigneeId.name?.charAt(0)}
                          </div>
                          <span className="text-[10px] font-semibold text-sky-900 truncate max-w-[80px]">
                            {st.assigneeId.name}
                          </span>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] border border-slate-200">
                          -
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Level 3: Mini-tasks (Rendered when Subtask is expanded) */}
                  {isSubExpanded && hasMinitasks && (
                    <div className="flex flex-col bg-amber-50/20 divide-y divide-amber-100/50">
                      {minitasks.map((mini: any) => {
                        const isMiniExpanded = !!expandedMinitasks[mini._id];
                        const microtasks = Array.isArray(mini.microtasks) ? mini.microtasks : [];
                        const hasMicrotasks = microtasks.length > 0;

                        return (
                          <div key={mini._id} className="flex flex-col">
                            {/* Mini-task Row */}
                            <div
                              onClick={() => onSelectTask(task, { targetSubtaskId: st._id, targetMinitaskId: mini._id })}
                              className="pl-14 pr-3.5 py-1.5 hover:bg-amber-50/60 flex items-center justify-between gap-3 cursor-pointer transition-colors group border-l-4"
                              style={{ borderLeftColor: LEVEL_THEMES.MINITASK.accentColor }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <CornerDownRight className="w-3 h-3 text-amber-500 shrink-0" />

                                {/* Mini-task Dropdown Toggle */}
                                {hasMicrotasks ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedMinitasks((prev) => ({ ...prev, [mini._id]: !prev[mini._id] }));
                                    }}
                                    className="p-1 hover:bg-amber-100 rounded text-amber-700 transition-colors cursor-pointer"
                                    title={isMiniExpanded ? "Collapse micro-tasks" : "Expand micro-tasks"}
                                  >
                                    {isMiniExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-amber-700" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-amber-500" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="w-4 h-4 flex items-center justify-center">
                                    <span className="w-1 h-1 rounded-full bg-amber-300" />
                                  </span>
                                )}

                                {/* Level 3 Badge: MINI-TASK */}
                                <span
                                  className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs shrink-0"
                                  style={{
                                    backgroundColor: LEVEL_THEMES.MINITASK.badgeBg,
                                    color: LEVEL_THEMES.MINITASK.badgeText,
                                    borderColor: LEVEL_THEMES.MINITASK.badgeBorder
                                  }}
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                  <span>MINI-TASK</span>
                                </span>

                                {mini.key && (
                                  <span className="font-mono text-xs font-bold text-amber-900 bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
                                    {mini.key}
                                  </span>
                                )}

                                <span className="text-xs font-semibold text-slate-800 truncate">
                                  {mini.title}
                                </span>

                                {mini.isLocked && (
                                  <span
                                    className="text-[9px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0"
                                    title={`Locked by ${mini.lockedBy?.name || 'Lead'}`}
                                  >
                                    <Lock className="w-2.5 h-2.5 text-rose-600" />
                                    <span>Locked</span>
                                  </span>
                                )}

                                {/* Microtasks Count Tag */}
                                {hasMicrotasks && (
                                  <button
                                    type="button"
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                    style={{
                                      backgroundColor: LEVEL_THEMES.MICROTASK.badgeBg,
                                      color: LEVEL_THEMES.MICROTASK.badgeText,
                                      borderColor: LEVEL_THEMES.MICROTASK.badgeBorder
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedMinitasks((prev) => ({ ...prev, [mini._id]: !prev[mini._id] }));
                                    }}
                                  >
                                    <span>{microtasks.length} Micro-tasks</span>
                                  </button>
                                )}
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{
                                  backgroundColor: LEVEL_THEMES.MINITASK.badgeBg,
                                  color: LEVEL_THEMES.MINITASK.badgeText,
                                  borderColor: LEVEL_THEMES.MINITASK.badgeBorder
                                }}>
                                  {mini.status || 'TODO'}
                                </span>

                                {mini.assigneeId ? (
                                  <div
                                    title={`Assigned to ${mini.assigneeId.name}`}
                                    className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                                  >
                                    <div className="w-4 h-4 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
                                      {mini.assigneeId.name?.charAt(0)}
                                    </div>
                                    <span className="text-[10px] font-semibold text-amber-900 truncate max-w-[80px]">
                                      {mini.assigneeId.name}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] border border-slate-200">
                                    -
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Level 4: Micro-tasks (Rendered when Mini-task is expanded) */}
                            {isMiniExpanded && hasMicrotasks && (
                              <div className="flex flex-col bg-emerald-50/20 divide-y divide-emerald-100/50">
                                {microtasks.map((mic: any) => (
                                  <div
                                    key={mic._id}
                                    onClick={() => onSelectTask(task, { targetSubtaskId: st._id, targetMinitaskId: mini._id, targetMicrotaskId: mic._id })}
                                    className="pl-20 pr-3.5 py-1.5 hover:bg-emerald-50/60 flex items-center justify-between gap-3 cursor-pointer transition-colors group border-l-4"
                                    style={{ borderLeftColor: LEVEL_THEMES.MICROTASK.accentColor }}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <CornerDownRight className="w-2.5 h-2.5 text-emerald-500 shrink-0" />

                                      {/* Level 4 Badge: MICRO-TASK */}
                                      <span
                                        className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border flex items-center gap-1 shadow-2xs shrink-0"
                                        style={{
                                          backgroundColor: LEVEL_THEMES.MICROTASK.badgeBg,
                                          color: LEVEL_THEMES.MICROTASK.badgeText,
                                          borderColor: LEVEL_THEMES.MICROTASK.badgeBorder
                                        }}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                        <span>MICRO-TASK</span>
                                      </span>

                                      {mic.key && (
                                        <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100/70 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                          {mic.key}
                                        </span>
                                      )}

                                      <span className="text-xs font-medium text-slate-700 truncate">
                                        {mic.title}
                                      </span>

                                      {mic.isLocked && (
                                        <span
                                          className="text-[8px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0"
                                          title={`Locked by ${mic.lockedBy?.name || 'Lead'}`}
                                        >
                                          <Lock className="w-2 h-2 text-rose-600" />
                                          <span>Locked</span>
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border" style={{
                                        backgroundColor: LEVEL_THEMES.MICROTASK.badgeBg,
                                        color: LEVEL_THEMES.MICROTASK.badgeText,
                                        borderColor: LEVEL_THEMES.MICROTASK.badgeBorder
                                      }}>
                                        {mic.status || 'TODO'}
                                      </span>

                                      {mic.assigneeId ? (
                                        <div
                                          title={`Assigned to ${mic.assigneeId.name}`}
                                          className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
                                        >
                                          <div className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
                                            {mic.assigneeId.name?.charAt(0)}
                                          </div>
                                          <span className="text-[10px] font-semibold text-emerald-900 truncate max-w-[80px]">
                                            {mic.assigneeId.name}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px] border border-slate-200">
                                          -
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 text-[#111827]">
      {/* Top Controls Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#111827] tracking-tight">Sprint Backlog & Planning</h2>
          <p className="text-xs text-[#111827]/60">
            Organize upcoming sprints and commit issues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canImportExcel && (
            <button
              onClick={() => setIsExcelImportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-[0.98]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              <span>Import from Excel</span>
            </button>
          )}
          <button
            onClick={handleExportToExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-[0.98] disabled:opacity-50"
          >
            {isExportingExcel ? (
              <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-white" />
            )}
            <span>{isExportingExcel ? 'Exporting...' : 'Export to Excel'}</span>
          </button>
          {canManageSprint && (
            <button
              onClick={() => createSprintMutation.mutate()}
              disabled={createSprintMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F172A] hover:bg-[#111827] text-white rounded-xl text-xs font-bold border border-[#0F172A] shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5 text-[#22C55E]" />
              <span>+ Create sprint</span>
            </button>
          )}
        </div>
      </div>

      {/* Sprints Section */}
      <div className="flex flex-col gap-5">
        {sprints.map((sprint: any) => {
          const sprintTasks = tasksBySprint[sprint._id] || [];
          const isCollapsed = collapsedSprints[sprint._id];
          const isInlineOpen = activeInlineSprintId === sprint._id;

          return (
            <div
              key={sprint._id}
              className="bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl overflow-hidden shadow-xs transition-all"
            >
              {/* Sprint Header */}
              <div className="p-4 bg-[#F3F4F6]/90 border-b border-[#0F172A]/10 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => toggleCollapse(sprint._id)}
                    className="p-1 hover:bg-white rounded text-[#111827]/60 hover:text-[#111827] transition-colors cursor-pointer"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    {editingSprintId === sprint._id ? (
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingSprintName}
                          onChange={(e) => setEditingSprintName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingSprintName.trim() && editingSprintName.trim() !== sprint.name) {
                                renameSprintMutation.mutate({ sprintId: sprint._id, newName: editingSprintName.trim() });
                              } else {
                                setEditingSprintId(null);
                              }
                            } else if (e.key === 'Escape') {
                              setEditingSprintId(null);
                            }
                          }}
                          autoFocus
                          className="px-2 py-0.5 text-sm font-bold text-[#111827] bg-white border border-blue-500 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-xs min-w-[170px]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editingSprintName.trim() && editingSprintName.trim() !== sprint.name) {
                              renameSprintMutation.mutate({ sprintId: sprint._id, newName: editingSprintName.trim() });
                            } else {
                              setEditingSprintId(null);
                            }
                          }}
                          disabled={renameSprintMutation.isPending}
                          className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-md transition-colors cursor-pointer"
                          title="Save sprint name (Enter)"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingSprintId(null)}
                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
                          title="Cancel (Esc)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/sprintname">
                        <span
                          onClick={() => {
                            if (canManageSprint) {
                              setEditingSprintId(sprint._id);
                              setEditingSprintName(sprint.name);
                            }
                          }}
                          className={`text-sm font-bold text-[#111827] ${
                            canManageSprint ? 'hover:text-blue-600 cursor-pointer transition-colors' : ''
                          }`}
                          title={canManageSprint ? 'Click to rename sprint' : undefined}
                        >
                          {sprint.name}
                        </span>
                        {canManageSprint && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSprintId(sprint._id);
                              setEditingSprintName(sprint.name);
                            }}
                            className="p-0.5 text-slate-400 hover:text-blue-600 opacity-0 group-hover/sprintname:opacity-100 transition-opacity cursor-pointer rounded"
                            title="Rename sprint"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                        sprint.status === 'ACTIVE'
                          ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30 font-bold'
                          : sprint.status === 'COMPLETED'
                          ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30 font-bold'
                          : 'bg-[#F3F4F6] text-[#111827]/70 border-[#0F172A]/10'
                      }`}
                    >
                      {sprint.status}
                    </span>

                    {/* Sprint Participating Teams Badges */}
                    {sprint.teams && sprint.teams.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {sprint.teams.map((tm: string) => (
                          <span
                            key={tm}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 shadow-2xs"
                          >
                            👥 {tm}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600">
                        🌐 All Teams
                      </span>
                    )}

                    <span className="text-xs text-[#111827]/60 font-medium">
                      ({sprintTasks.length} issues)
                    </span>
                  </div>
                </div>

                {/* Sprint Right Controls */}
                {canManageSprint && (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSprintId(sprint._id);
                        setEditingSprintName(sprint.name);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-slate-200 shadow-2xs"
                      title="Rename sprint"
                    >
                      <Pencil className="w-3 h-3 text-slate-500" />
                      <span>Rename</span>
                    </button>

                    {sprint.status === 'PLANNED' && (
                      <button
                        onClick={() => startSprintMutation.mutate(sprint._id)}
                        disabled={startSprintMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1 bg-[#0F172A] hover:bg-[#111827] text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                      >
                        <Play className="w-3 h-3 fill-[#22C55E] text-[#22C55E]" />
                        <span>Start sprint</span>
                      </button>
                    )}

                    {sprint.status === 'ACTIVE' && (
                      <button
                        onClick={() => completeSprintMutation.mutate(sprint._id)}
                        disabled={completeSprintMutation.isPending}
                        className="flex items-center gap-1 px-3 py-1 bg-[#22C55E] hover:bg-[#22C55E]/90 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
                      >
                        <CheckCheck className="w-3 h-3" />
                        <span>Complete sprint</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Task Items List */}
              {!isCollapsed && (
                <div className="flex flex-col">
                  {sprintTasks.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      No tasks in this sprint
                    </div>
                  ) : (
                    sprintTasks.map(renderTaskTree)
                  )}

                  {canCreateTask && (
                    <button
                      onClick={() => onOpenCreateTask('TODO', leadTeamToPass, sprint._id)}
                      className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-500" />
                      <span>Create task</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unassigned / Project Backlog */}
        <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-slate-800">Backlog (Unassigned to Sprints)</span>
              <span className="text-xs text-slate-500">
                ({tasksBySprint.backlog.length} tasks)
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            {tasksBySprint.backlog.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No tasks in backlog
              </div>
            ) : (
              tasksBySprint.backlog.map(renderTaskTree)
            )}

            {canCreateTask && (
              <button
                onClick={() => onOpenCreateTask('BACKLOG', leadTeamToPass, '')}
                className="w-full text-left px-4 py-2.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer font-semibold"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span>Create task in backlog</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Excel Sprint & Task Bulk Import Modal */}
      <ExcelImportModal
        isOpen={isExcelImportOpen}
        onClose={() => setIsExcelImportOpen(false)}
        projectId={projectId}
        projectName={projectDetail?.name}
        projectKey={projectDetail?.key || 'PRJ'}
      />
    </div>
  );
};
