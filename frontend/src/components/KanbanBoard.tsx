'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { getSocket, joinProjectRoom, leaveProjectRoom } from '../lib/socket';
import { broadcastSyncEvent, subscribeCrossTabSync } from '../lib/crossTabSync';
import { useAuthStore } from '../store/authStore';
import { KanbanColumnSkeleton } from './Skeletons';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ExcelImportModal } from './ExcelImportModal';
import {
  MoreHorizontal,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  Bookmark,
  Layers,
  Sparkles,
  User as UserIcon,
  Flame,
  Zap,
  CheckCheck,
  Calendar,
  Flag,
  ArrowRight,
  ArrowLeft,
  Search,
  Filter,
  SlidersHorizontal,
  RotateCcw,
  BarChart2,
  Share2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  MoveLeft,
  MoveRight,
  GripVertical,
  Bug,
  BookmarkCheck,
  CheckSquare,
  Check,
  Users,
  Lock,
  CornerDownRight,
  FileSpreadsheet,
  Download,
  RefreshCw,
  X
} from 'lucide-react';
import { downloadProjectExcel } from '../lib/excelExport';

interface Subtask {
  _id: string;
  key?: string;
  title: string;
  description?: string;
  status?: string;
  isCompleted: boolean;
  startDate?: string;
  dueDate?: string;
  assigneeId?: any;
  microtasks?: any[];
}

interface Task {
  _id: string;
  key: string;
  title: string;
  description: string;
  issueType: string;
  priority: string;
  status: string;
  team?: string;
  assigneeId?: any;
  reporterId?: any;
  sprintId?: any;
  sprint?: string;
  labels?: string[];
  dueDate?: string;
  attachments?: any[];
  subtasks?: Subtask[];
}

interface KanbanBoardProps {
  projectId: string;
  onSelectTask: (task: Task, context?: { targetSubtaskId?: string; targetMicrotaskId?: string }) => void;
  onOpenCreateTask: (initialStatus?: string, initialTeam?: string, initialSprintId?: string) => void;
  searchQuery?: string;
}

interface BoardColumn {
  id: string;
  label: string;
  color: string;
}

const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'BACKLOG', label: 'Idea', color: 'bg-slate-500' },
  { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-500' },
  { id: 'IN_REVIEW', label: 'Testing', color: 'bg-purple-500' },
  { id: 'DONE', label: 'Done', color: 'bg-emerald-500' },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  projectId,
  onSelectTask,
  onOpenCreateTask,
  searchQuery = ''
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Column management states
  const [columns, setColumns] = useState<BoardColumn[]>(DEFAULT_COLUMNS);
  const [openColumnMenuId, setOpenColumnMenuId] = useState<string | null>(null);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editColLabel, setEditColLabel] = useState('');

  // Drag & drop states
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedSubtaskId, setDraggedSubtaskId] = useState<string | null>(null);
  const [draggedColumnIdx, setDraggedColumnIdx] = useState<number | null>(null);

  // Sprint states
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [isNewSprintModalOpen, setIsNewSprintModalOpen] = useState(false);
  const [isCompleteSprintModalOpen, setIsCompleteSprintModalOpen] = useState(false);
  const [isEditSprintModalOpen, setIsEditSprintModalOpen] = useState(false);
  const [isSprintHistoryModalOpen, setIsSprintHistoryModalOpen] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');
  const [newSprintStartDate, setNewSprintStartDate] = useState('');
  const [newSprintEndDate, setNewSprintEndDate] = useState('');
  const [editSprintName, setEditSprintName] = useState('');
  const [editSprintGoal, setEditSprintGoal] = useState('');
  const [editSprintStartDate, setEditSprintStartDate] = useState('');
  const [editSprintEndDate, setEditSprintEndDate] = useState('');
  const [editSprintReason, setEditSprintReason] = useState('');
  const [nextSprintIdForIncomplete, setNextSprintIdForIncomplete] = useState('');
  const [localSearch, setLocalSearch] = useState(searchQuery || '');
  useEffect(() => {
    if (searchQuery !== undefined) {
      setLocalSearch(searchQuery);
    }
  }, [searchQuery]);
  const [selectedAssigneeFilter, setSelectedAssigneeFilter] = useState<string | null>(null);
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('');
  const [isAddTeamModalOpen, setIsAddTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamKey, setNewTeamKey] = useState('');
  const [newTeamColor, setNewTeamColor] = useState('#0284C7');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamLeadId, setNewTeamLeadId] = useState('');
  const [isMembersDropdownOpen, setIsMembersDropdownOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const membersDropdownRef = useRef<HTMLDivElement>(null);
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

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
      console.error('Failed to export tasks to Excel:', err);
      alert('Failed to export tasks to Excel. Please check your network connection.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        membersDropdownRef.current &&
        !membersDropdownRef.current.contains(e.target as Node)
      ) {
        setIsMembersDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Inline creation
  const [inlineCreateStatus, setInlineCreateStatus] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState('');

  // Fetch Project Sprints
  const { data: sprints = [], isLoading: isLoadingSprints } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/sprints`);
      return res.data.data;
    },
    enabled: !!projectId,
    refetchInterval: 4000 // Real-time polling
  });

  // Fetch Project Members for avatar filter
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/members`);
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

  // Fetch Project Detail for persistent custom workflow stages
  const { data: projectDetail } = useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // Viewport Minimap / Floating Column Navigator state
  const [scrollMetrics, setScrollMetrics] = useState({ scrollLeft: 0, scrollWidth: 1, clientWidth: 1 });

  const handleBoardScroll = () => {
    if (boardScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = boardScrollRef.current;
      setScrollMetrics({
        scrollLeft,
        scrollWidth: Math.max(scrollWidth, 1),
        clientWidth: Math.max(clientWidth, 1)
      });
    }
  };

  // Find active sprints
  const activeSprints = useMemo(() => {
    return sprints.filter((s: any) => s.status === 'ACTIVE');
  }, [sprints]);

  // Find the most appropriate active sprint for the current team (or project default)
  const activeSprint = useMemo(() => {
    if (activeSprints.length === 0) return null;
    if (activeSprints.length === 1) return activeSprints[0];

    // If multiple active sprints exist, match by active team name (e.g. "Firmware Sprint 1")
    const teamNameToMatch = (selectedTeamFilter || '').toLowerCase().trim();
    if (teamNameToMatch && teamNameToMatch !== 'all') {
      const match = activeSprints.find((s: any) => {
        const sName = (s.name || '').toLowerCase().trim();
        return sName.includes(teamNameToMatch) || teamNameToMatch.includes(sName);
      });
      if (match) return match;
    }
    return activeSprints[0];
  }, [activeSprints, selectedTeamFilter]);

  const currentSprint =
    selectedSprintId === 'ALL'
      ? null
      : sprints.find((s: any) => s._id === selectedSprintId) || activeSprint || sprints[0] || null;

  const hasInitializedSprintRef = useRef(false);

  // Reset sprint initialization on project change
  useEffect(() => {
    hasInitializedSprintRef.current = false;
  }, [projectId]);

  // Auto sync sprint selection: ALWAYS auto-load ACTIVE sprint on start!
  useEffect(() => {
    if (sprints && sprints.length > 0) {
      if (!hasInitializedSprintRef.current) {
        if (activeSprint) {
          setSelectedSprintId(activeSprint._id);
        } else {
          setSelectedSprintId(sprints[0]._id);
        }
        hasInitializedSprintRef.current = true;
      } else {
        if (selectedSprintId !== 'ALL' && !sprints.some((s: any) => s._id === selectedSprintId)) {
          setSelectedSprintId(activeSprint ? activeSprint._id : sprints[0]._id);
        }
      }
    }
  }, [sprints, activeSprint, selectedSprintId]);

  // Fetch Sprint Tasks with live refetching
  const { data, isLoading } = useQuery({
    queryKey: ['kanban', projectId, selectedSprintId, currentSprint?._id],
    queryFn: async () => {
      if (!projectId) return null;
      let url = `/tasks/kanban?projectId=${projectId}`;
      if (selectedSprintId !== 'ALL' && currentSprint?._id) {
        url += `&sprintId=${currentSprint._id}`;
      }
      const res = await api.get(url);
      return res.data.data;
    },
    enabled: !!projectId,
    refetchInterval: 3000 // Realtime live sync every 3 seconds!
  });

  // Identify active selected team
  const selectedTeam = projectTeams.find(
    (t: any) =>
      t.name?.toLowerCase().trim() === selectedTeamFilter.toLowerCase().trim() ||
      t._id === selectedTeamFilter ||
      t.key?.toLowerCase().trim() === selectedTeamFilter.toLowerCase().trim()
  );

  // Calculate task count per member in this active team & sprint board
  const memberTaskCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    if (data) {
      Object.values(data).forEach((taskList: any) => {
        if (Array.isArray(taskList)) {
          taskList.forEach((task: Task) => {
            // If team filter is active, only count tasks for this team
            if (selectedTeamFilter && selectedTeamFilter !== 'ALL') {
              const taskTeam = (task.team || '').toLowerCase().trim();
              const filterLower = selectedTeamFilter.toLowerCase().trim();
              const teamKey = (selectedTeam?.key || '').toLowerCase().trim();
              const matchesTeam =
                taskTeam === filterLower ||
                taskTeam.includes(filterLower) ||
                filterLower.includes(taskTeam) ||
                (teamKey && taskTeam === teamKey);
              if (!matchesTeam) return;
            }

            const aId = task.assigneeId?._id || (typeof task.assigneeId === 'string' ? task.assigneeId : null);
            if (aId) {
              counts[aId] = (counts[aId] || 0) + 1;
            }
          });
        }
      });
    }
    return counts;
  }, [data, selectedTeamFilter, selectedTeam]);

  // Filter members belonging strictly to the active team and/or active sprint tasks
  const boardMembers = React.useMemo(() => {
    const teamMemberIds = new Set<string>();
    const explicitTeamMembers: any[] = [];

    // 1. Members belonging to the selected team (lead and members)
    if (selectedTeam) {
      if (selectedTeam.leadId) {
        const leadObj = selectedTeam.leadId;
        const leadId = typeof leadObj === 'object' ? leadObj._id : leadObj;
        if (leadId) {
          teamMemberIds.add(leadId.toString());
          if (typeof leadObj === 'object') explicitTeamMembers.push(leadObj);
        }
      }
      if (Array.isArray(selectedTeam.members)) {
        selectedTeam.members.forEach((m: any) => {
          const mId = typeof m === 'object' ? m._id : m;
          if (mId) {
            teamMemberIds.add(mId.toString());
            if (typeof m === 'object') explicitTeamMembers.push(m);
          }
        });
      }
    }

    // 2. Members who have tasks in the current team / sprint board
    if (data) {
      Object.values(data).forEach((taskList: any) => {
        if (Array.isArray(taskList)) {
          taskList.forEach((task: Task) => {
            if (selectedTeamFilter && selectedTeamFilter !== 'ALL') {
              const taskTeam = (task.team || '').toLowerCase().trim();
              const filterLower = selectedTeamFilter.toLowerCase().trim();
              const teamKey = (selectedTeam?.key || '').toLowerCase().trim();
              const matchesTeam =
                taskTeam === filterLower ||
                taskTeam.includes(filterLower) ||
                filterLower.includes(taskTeam) ||
                (teamKey && taskTeam === teamKey);
              if (!matchesTeam) return;
            }
            const a = task.assigneeId;
            const aId = a?._id || (typeof a === 'string' ? a : null);
            if (aId) {
              teamMemberIds.add(aId.toString());
              if (typeof a === 'object' && a._id) explicitTeamMembers.push(a);
            }
          });
        }
      });
    }

    // 3. Match against project members list
    const result: any[] = [];
    const seenIds = new Set<string>();

    members.forEach((m: any) => {
      const id = (m._id || m.userId)?.toString();
      if (id && teamMemberIds.has(id) && !seenIds.has(id)) {
        seenIds.add(id);
        result.push(m);
      }
    });

    // Also include any populated member objects from team/tasks not yet in result
    explicitTeamMembers.forEach((m: any) => {
      const id = (m._id || m.userId)?.toString();
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        result.push(m);
      }
    });

    // If team has members or tasks, return the team members sorted with active tasks first
    if (result.length > 0) {
      return result.sort((a, b) => {
        const countA = memberTaskCounts[a._id] || 0;
        const countB = memberTaskCounts[b._id] || 0;
        if (countA !== countB) return countB - countA;
        return (a.name || '').localeCompare(b.name || '');
      });
    }

    // If no team members found yet, filter members with tasks in current board
    const membersWithTasks = members.filter((m: any) => (memberTaskCounts[m._id] || 0) > 0);
    if (membersWithTasks.length > 0) return membersWithTasks;

    return [];
  }, [members, selectedTeam, selectedTeamFilter, data, memberTaskCounts]);

  useEffect(() => {
    const timer = setTimeout(handleBoardScroll, 100);
    window.addEventListener('resize', handleBoardScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleBoardScroll);
    };
  }, [columns, data]);

  // Real-time WebSockets & Cross-Tab Sync for live board updates across team members & tabs
  useEffect(() => {
    if (!projectId) return;

    joinProjectRoom(projectId);
    const s = getSocket();

    const handleTaskEvent = () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks'] });
    };

    // Socket events
    s.on('task:created', handleTaskEvent);
    s.on('task:reordered', handleTaskEvent);
    s.on('task:updated', handleTaskEvent);
    s.on('task:deleted', handleTaskEvent);
    s.on('task:restored', handleTaskEvent);

    // Cross-tab events from other open tabs
    const unsubscribe = subscribeCrossTabSync((msg) => {
      if (
        msg.type === 'TASK_DELETED' ||
        msg.type === 'TASK_RESTORED' ||
        msg.type === 'TASK_CREATED' ||
        msg.type === 'TASK_UPDATED' ||
        msg.type === 'RECYCLE_BIN_CHANGED'
      ) {
        handleTaskEvent();
      }
    });

    return () => {
      leaveProjectRoom(projectId);
      unsubscribe();
      s.off('task:created', handleTaskEvent);
      s.off('task:reordered', handleTaskEvent);
      s.off('task:updated', handleTaskEvent);
      s.off('task:deleted', handleTaskEvent);
      s.off('task:restored', handleTaskEvent);
    };
  }, [projectId, queryClient]);

  const currentUserIdStr = ((user as any)?._id || user?.id)?.toString();
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

  // Flattened board tasks for tracking Main Tasks and their Subtasks across all columns
  const allBoardTasks: Task[] = useMemo(() => {
    if (!data) return [];
    const list: Task[] = [];
    Object.values(data).forEach((colTasks) => {
      if (Array.isArray(colTasks)) {
        list.push(...(colTasks as Task[]));
      }
    });
    return list;
  }, [data]);

  const isLevel3 = user?.role === 'TEAM_LEAD' || userLeadTeamNames.size > 0;
  const isLevel4 = !isLevel1 && !isLevel2 && !isLevel3 && !isGuest;

  const canManageColumns = isLevel1 || isLevel2;
  const canManageSprint = isLevel1 || isLevel2;

  // For Team Leads: can ONLY create tasks when actively viewing their own assigned team
  const isCurrentFilterMyLeadTeam = useMemo(() => {
    if (!selectedTeamFilter || selectedTeamFilter === 'ALL') return false;
    const cleanFilter = selectedTeamFilter.toLowerCase().trim();
    return (
      userLeadTeamNames.has(cleanFilter) ||
      Array.from(userLeadTeamNames).some((tn: string) => cleanFilter.includes(tn) || tn.includes(cleanFilter))
    );
  }, [selectedTeamFilter, userLeadTeamNames]);

  const canCreateTask = !isGuest && (
    isLevel1 ||
    isLevel2 ||
    (isLevel3 && isCurrentFilterMyLeadTeam)
  );

  // Check if a user can drag/move a specific task across stages
  const canDragTask = (task: Task): boolean => {
    // If task has subtasks, it cannot be dragged directly; its stage changes automatically via its subtasks
    if (task.subtasks && task.subtasks.length > 0) return false;
    if (isGuest) return false;
    if (isLevel1 || isLevel2) return true;
    if (isLevel3) {
      if (!task.team) return false;
      return userLeadTeamNames.has(task.team.toLowerCase().trim());
    }
    if (isLevel4) {
      const aId = (task.assigneeId?._id || task.assigneeId)?.toString();
      return aId === currentUserIdStr;
    }
    return false;
  };

  // Check if a user can drag/move a specific subtask across stages
  const canDragSubtask = (parentTask: Task, subtask: Subtask): boolean => {
    // If subtask has microtasks, its stage is automated from its microtasks!
    if (subtask.microtasks && subtask.microtasks.length > 0) return false;
    if (isGuest) return false;
    if (isLevel1 || isLevel2) return true;
    const repId = (parentTask.reporterId?._id || parentTask.reporterId)?.toString();
    if (repId && repId === currentUserIdStr) return true;
    if (isLevel3) {
      if (!parentTask.team) return true;
      return userLeadTeamNames.has(parentTask.team.toLowerCase().trim()) || userLeadTeamNames.size > 0;
    }
    if (isLevel4) {
      const parentAssigneeId = (parentTask.assigneeId?._id || parentTask.assigneeId)?.toString();
      const subAssigneeId = (subtask.assigneeId?._id || subtask.assigneeId)?.toString();
      return subAssigneeId === currentUserIdStr || parentAssigneeId === currentUserIdStr;
    }
    return false;
  };

  // Check if a user can drag/move a specific microtask across stages
  const canDragMicrotask = (parentTask: Task, subtask: Subtask, microtask: any): boolean => {
    if (isGuest) return false;
    if (isLevel1 || isLevel2) return true;
    const repId = (parentTask.reporterId?._id || parentTask.reporterId)?.toString();
    if (repId && repId === currentUserIdStr) return true;
    if (isLevel3) {
      if (!parentTask.team) return true;
      return userLeadTeamNames.has(parentTask.team.toLowerCase().trim()) || userLeadTeamNames.size > 0;
    }
    if (isLevel4) {
      const parentAssigneeId = (parentTask.assigneeId?._id || parentTask.assigneeId)?.toString();
      const subAssigneeId = (subtask.assigneeId?._id || subtask.assigneeId)?.toString();
      const micAssigneeId = (microtask.assigneeId?._id || microtask.assigneeId)?.toString();
      return micAssigneeId === currentUserIdStr || subAssigneeId === currentUserIdStr || parentAssigneeId === currentUserIdStr;
    }
    return false;
  };

  const isAdminOrLead = isLevel1 || isLevel2 || isLevel3;
  const isManagement = isLevel1 || isLevel2;

  // Task Soft Deletion State & Permissions
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const canDeleteTask = (task: Task): boolean => {
    if (isGuest) return false;
    if (isLevel1 || isLevel2) return true;
    if (isLevel3) {
      if (!task.team) return false;
      return userLeadTeamNames.has((task.team || '').toLowerCase().trim());
    }
    const repId = (task.reporterId?._id || task.reporterId)?.toString();
    const assId = (task.assigneeId?._id || task.assigneeId)?.toString();
    return repId === currentUserIdStr || assId === currentUserIdStr;
  };

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.delete(`/tasks/${taskId}`);
      return res.data;
    },
    onSuccess: () => {
      broadcastSyncEvent('TASK_DELETED', { taskId: taskToDelete?._id, projectId });
      queryClient.invalidateQueries({ queryKey: ['kanban', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary', projectId] });
      setTaskToDelete(null);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to move task to Recycle Bin');
      setTaskToDelete(null);
    }
  });

  // Helper to normalize any ID representation into a clean string
  const normalizeId = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val._id) return val._id.toString();
    if (val.id) return val.id.toString();
    if (val.userId) return normalizeId(val.userId);
    return val.toString();
  };

  // Intelligently detect current user's team in this project:
  // 1. Direct team lead match
  // 2. Direct team member match
  // 3. User's active task assignments in this project
  // 4. User's jobTitle / department / role matching (e.g. "Firmware Engineer", "Hardware", "QA", "FIRMWARE")
  const detectedUserTeam = useMemo(() => {
    if (!projectTeams || projectTeams.length === 0) return null;

    const myId = currentUserIdStr;
    const userRoleStr = (user?.role || '').toLowerCase().trim();
    const userJobTitleStr = (user?.jobTitle || '').toLowerCase().trim();
    const userDeptStr = ((user as any)?.department || '').toLowerCase().trim();

    // 1. Team Lead
    const ledTeam = projectTeams.find((tm: any) => {
      const leadIdStr = normalizeId(tm.leadId);
      if (leadIdStr && leadIdStr === myId) return true;
      const nm = (tm.name || '').toLowerCase().trim();
      const ky = (tm.key || '').toLowerCase().trim();
      return userLeadTeamNames.has(nm) || userLeadTeamNames.has(ky);
    });
    if (ledTeam) return ledTeam;

    // 2. Team Member
    const memberTeam = projectTeams.find((tm: any) => {
      if (!Array.isArray(tm.members)) return false;
      return tm.members.some((m: any) => normalizeId(m) === myId);
    });
    if (memberTeam) return memberTeam;

    // 3. Task assignment: user has tasks assigned in this project with a team tag
    if (allBoardTasks && allBoardTasks.length > 0) {
      const taskWithTeam = allBoardTasks.find((t: Task) => {
        const aId = normalizeId(t.assigneeId);
        return aId === myId && t.team;
      });
      if (taskWithTeam?.team) {
        const tTeam = taskWithTeam.team.toLowerCase().trim();
        const matched = projectTeams.find((tm: any) => {
          const nm = (tm.name || '').toLowerCase().trim();
          const ky = (tm.key || '').toLowerCase().trim();
          return nm === tTeam || ky === tTeam || nm.includes(tTeam) || tTeam.includes(nm);
        });
        if (matched) return matched;
      }
    }

    // 4. Job title / Department / Role match
    // e.g. "Firmware Engineer", "Firmware Team Lead", "Embedded Firmware" -> matches "Firmware"
    const disciplineTeam = projectTeams.find((tm: any) => {
      const tmName = (tm.name || '').toLowerCase().trim();
      const tmKey = (tm.key || '').toLowerCase().trim();

      const matchesTitle = tmName && (userJobTitleStr.includes(tmName) || tmName.includes(userJobTitleStr));
      const matchesDept = tmName && userDeptStr && (userDeptStr.includes(tmName) || tmName.includes(userDeptStr));
      const matchesRole = tmName && userRoleStr && (userRoleStr.includes(tmName) || tmName.includes(userRoleStr));
      const matchesKey = tmKey && tmKey.length >= 2 && (userJobTitleStr.includes(tmKey) || userRoleStr.includes(tmKey));

      return matchesTitle || matchesDept || matchesRole || matchesKey;
    });
    if (disciplineTeam) return disciplineTeam;

    return null;
  }, [projectTeams, currentUserIdStr, user, allBoardTasks]);

  const hasInitializedTeamRef = useRef(false);

  // Reset team initialization flag when project changes
  useEffect(() => {
    hasInitializedTeamRef.current = false;
  }, [projectId]);

  // Auto-detect user's team or default based on role:
  // - If Team Lead or Member (Firmware Engineer, Hardware, etc. - non-management):
  //   Automatically load THEIR team on start!
  // - If Project Manager or Org/Super Admin (management):
  //   Can view all teams ('ALL') or remain on current selection
  useEffect(() => {
    if (!projectTeams || projectTeams.length === 0) return;

    if (!isManagement) {
      // Non-management: ALWAYS load their own team on start
      if (detectedUserTeam) {
        if (!hasInitializedTeamRef.current || !projectTeams.some((t: any) => t.name === selectedTeamFilter)) {
          setSelectedTeamFilter(detectedUserTeam.name);
          hasInitializedTeamRef.current = true;
        }
      } else if (!hasInitializedTeamRef.current && (!selectedTeamFilter || !projectTeams.some((t: any) => t.name === selectedTeamFilter))) {
        setSelectedTeamFilter(projectTeams[0].name);
        hasInitializedTeamRef.current = true;
      }
    } else {
      // Management (Project Manager, Org Admin, Super Admin): default to 'ALL' if nothing selected yet
      if (!hasInitializedTeamRef.current && !selectedTeamFilter) {
        setSelectedTeamFilter('ALL');
        hasInitializedTeamRef.current = true;
      }
    }
  }, [projectTeams, detectedUserTeam, isManagement, selectedTeamFilter]);

  // Sync state with selected team workflow stages or project stages
  useEffect(() => {
    if (selectedTeam && selectedTeam.workflowStages && selectedTeam.workflowStages.length > 0) {
      setColumns(selectedTeam.workflowStages);
    } else if (projectDetail?.workflowStages && projectDetail.workflowStages.length > 0) {
      setColumns(projectDetail.workflowStages);
    } else {
      setColumns(DEFAULT_COLUMNS);
    }
  }, [selectedTeamFilter, selectedTeam, projectDetail]);

  // Persist stages mutation (dynamically updates team stages or project stages)
  const persistStagesMutation = useMutation({
    mutationFn: async (updatedStages: BoardColumn[]) => {
      if (selectedTeam?._id) {
        const res = await api.put(`/projects/${projectId}/teams/${selectedTeam._id}/stages`, { stages: updatedStages });
        return res.data;
      } else {
        const res = await api.put(`/projects/${projectId}/stages`, { stages: updatedStages });
        return res.data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
    }
  });

  // Toggle Subtask Completion or Stage Mutation directly from Kanban Card
  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      subtaskId,
      isCompleted,
      status
    }: {
      taskId: string;
      subtaskId: string;
      isCompleted?: boolean;
      status?: string;
    }) => {
      const payload: any = {};
      if (status !== undefined) payload.status = status;
      if (isCompleted !== undefined) payload.isCompleted = isCompleted;
      const res = await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to update subtask');
    }
  });

  // Toggle Microtask Stage Mutation directly from Kanban Card
  const toggleMicrotaskStageMutation = useMutation({
    mutationFn: async ({
      taskId,
      subtaskId,
      microtaskId,
      status
    }: {
      taskId: string;
      subtaskId: string;
      microtaskId: string;
      status: string;
    }) => {
      const res = await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}/microtasks/${microtaskId}`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to update microtask');
    }
  });

  // Create Team Mutation
  const createTeamMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      key: string;
      color: string;
      description: string;
      leadId?: string;
    }) => {
      const res = await api.post(`/projects/${projectId}/teams`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-teams', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setIsAddTeamModalOpen(false);
      setNewTeamName('');
      setNewTeamKey('');
      setNewTeamDescription('');
      setNewTeamLeadId('');
      if (data?.data?.name) {
        setSelectedTeamFilter(data.data.name);
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to create team');
    }
  });

  // Scroll controls
  const handleScrollLeft = () => {
    if (boardScrollRef.current) {
      boardScrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (boardScrollRef.current) {
      boardScrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  // Move Column Position Left / Right
  const handleMoveColumn = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= columns.length) return;
    const newCols = [...columns];
    const [moved] = newCols.splice(index, 1);
    newCols.splice(targetIdx, 0, moved);
    setColumns(newCols);
    persistStagesMutation.mutate(newCols);
    setOpenColumnMenuId(null);
  };

  // Add Custom Column
  const handleAddColumn = () => {
    if (!newColLabel.trim()) return;
    const newId = newColLabel.trim().toUpperCase().replace(/\s+/g, '_');
    const newCol: BoardColumn = {
      id: newId,
      label: newColLabel.trim(),
      color: 'bg-blue-500'
    };
    const updated = [...columns, newCol];
    setColumns(updated);
    persistStagesMutation.mutate(updated);
    setNewColLabel('');
    setIsAddColumnModalOpen(false);
  };

  // Save Renamed Column
  const handleSaveRenameColumn = (colId: string) => {
    if (!editColLabel.trim()) return;
    const updated = columns.map((c) => (c.id === colId ? { ...c, label: editColLabel.trim() } : c));
    setColumns(updated);
    persistStagesMutation.mutate(updated);
    setEditingColumnId(null);
    setOpenColumnMenuId(null);
  };

  // Delete Column
  const handleDeleteColumn = (colId: string) => {
    if (columns.length <= 1) return;
    const updated = columns.filter((c) => c.id !== colId);
    setColumns(updated);
    persistStagesMutation.mutate(updated);
    setOpenColumnMenuId(null);
  };

  // Create Sprint Mutation
  const createSprintMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/projects/${projectId}/sprints`, {
        name: newSprintName || undefined,
        goal: newSprintGoal,
        startDate: newSprintStartDate || undefined,
        endDate: newSprintEndDate || undefined,
        status: 'PLANNED'
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      setIsNewSprintModalOpen(false);
      setNewSprintName('');
      setNewSprintGoal('');
      setNewSprintStartDate('');
      setNewSprintEndDate('');
      if (data?.data?._id) {
        setSelectedSprintId(data.data._id);
      }
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to create sprint');
    }
  });

  // Update / Extend Sprint Mutation
  const updateSprintMutation = useMutation({
    mutationFn: async () => {
      if (!currentSprint?._id) return;
      const res = await api.put(`/projects/${projectId}/sprints/${currentSprint._id}`, {
        name: editSprintName || undefined,
        goal: editSprintGoal,
        startDate: editSprintStartDate || undefined,
        endDate: editSprintEndDate || undefined,
        reason: editSprintReason || undefined
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setIsEditSprintModalOpen(false);
      setEditSprintReason('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to update sprint schedule');
    }
  });

  // Complete Sprint Mutation
  const completeSprintMutation = useMutation({
    mutationFn: async () => {
      if (!currentSprint?._id) return;
      const res = await api.patch(`/projects/${projectId}/sprints/${currentSprint._id}/complete`, {
        moveToSprintId: nextSprintIdForIncomplete || undefined
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setIsCompleteSprintModalOpen(false);
      setSelectedSprintId('');
    }
  });

  // Helper to ensure Team Leads always pass their assigned lead team
  const resolveLeadTeamForCreate = (fallbackTeam?: string) => {
    if (isLevel3 && !isLevel1 && !isLevel2) {
      if (fallbackTeam && userLeadTeamNames.has(fallbackTeam.toLowerCase().trim())) {
        return fallbackTeam;
      }
      return Array.from(userLeadTeamNames)[0] || undefined;
    }
    return fallbackTeam;
  };

  // Quick Inline Task Creation
  const inlineCreateMutation = useMutation({
    mutationFn: async ({ title, status }: { title: string; status: string }) => {
      const res = await api.post('/tasks', {
        projectId,
        title,
        status,
        team: resolveLeadTeamForCreate(selectedTeamFilter !== 'ALL' ? selectedTeamFilter : undefined),
        sprintId: currentSprint?._id || null,
        sprint: currentSprint?.name || 'Sprint 1'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      setInlineTitle('');
      setInlineCreateStatus(null);
    }
  });

  // Reorder / Drag-and-Drop Mutation
  const reorderMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await api.patch(`/tasks/${taskId}/reorder`, { status });
      return res.data;
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['kanban', projectId, selectedSprintId, currentSprint?._id] });
      const previousData = queryClient.getQueryData(['kanban', projectId, selectedSprintId, currentSprint?._id]);

      queryClient.setQueryData(['kanban', projectId, selectedSprintId, currentSprint?._id], (old: any) => {
        if (!old) return old;
        const newCols = { ...old };
        let movedTask: Task | null = null;

        Object.keys(newCols).forEach((colKey) => {
          newCols[colKey] = (newCols[colKey] || []).filter((t: Task) => {
            if (t._id === taskId) {
              movedTask = { ...t, status };
              return false;
            }
            return true;
          });
        });

        if (movedTask) {
          if (!newCols[status]) newCols[status] = [];
          newCols[status] = [movedTask, ...newCols[status]];
        }

        return newCols;
      });

      return { previousData };
    },
    onError: (err, newTodo, context: any) => {
      if (context?.previousData) {
        queryClient.setQueryData(['kanban', projectId, selectedSprintId, currentSprint?._id], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  const handleDragStart = (e: React.DragEvent, taskId: string, subtaskId?: string, microtaskId?: string) => {
    e.dataTransfer.setData('taskId', taskId);
    setDraggedTaskId(taskId);
    if (subtaskId) {
      e.dataTransfer.setData('subtaskId', subtaskId);
      setDraggedSubtaskId(subtaskId);
    } else {
      e.dataTransfer.setData('subtaskId', '');
      setDraggedSubtaskId(null);
    }
    if (microtaskId) {
      e.dataTransfer.setData('microtaskId', microtaskId);
    } else {
      e.dataTransfer.setData('microtaskId', '');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId') || draggedTaskId;
    const subtaskId = e.dataTransfer.getData('subtaskId') || draggedSubtaskId;
    const microtaskId = e.dataTransfer.getData('microtaskId');

    if (microtaskId && subtaskId && taskId) {
      toggleMicrotaskStageMutation.mutate({
        taskId,
        subtaskId,
        microtaskId,
        status: targetStatus
      });
      setDraggedTaskId(null);
      setDraggedSubtaskId(null);
      return;
    }

    if (subtaskId && taskId) {
      toggleSubtaskMutation.mutate({
        taskId,
        subtaskId,
        status: targetStatus
      });
      setDraggedTaskId(null);
      setDraggedSubtaskId(null);
      return;
    }

    if (taskId) {
      // Find task to check if current user can drag/move it
      let taskToMove: Task | null = null;
      if (data) {
        for (const colTasks of Object.values(data)) {
          if (Array.isArray(colTasks)) {
            const found = (colTasks as Task[]).find((t: Task) => t._id === taskId);
            if (found) {
              taskToMove = found;
              break;
            }
          }
        }
      }
      if (taskToMove && !canDragTask(taskToMove)) {
        setDraggedTaskId(null);
        setDraggedSubtaskId(null);
        return;
      }
      reorderMutation.mutate({ taskId, status: targetStatus });
    }
    setDraggedTaskId(null);
    setDraggedSubtaskId(null);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BUG':
        return (
          <span className="w-4 h-4 rounded-md bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200 shadow-2xs">
            <Bug className="w-2.5 h-2.5 stroke-[2.5]" />
          </span>
        );
      case 'EPIC':
        return (
          <span className="w-4 h-4 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-200 shadow-2xs">
            <Layers className="w-2.5 h-2.5 stroke-[2.5]" />
          </span>
        );
      case 'STORY':
        return (
          <span className="w-4 h-4 rounded-md bg-emerald-50 text-[#22C55E] flex items-center justify-center shrink-0 border border-[#22C55E]/30 shadow-2xs">
            <BookmarkCheck className="w-2.5 h-2.5 stroke-[2.5]" />
          </span>
        );
      default:
        return (
          <span className="w-4 h-4 rounded-md bg-[#0F172A]/10 text-[#0F172A] flex items-center justify-center shrink-0 border border-[#0F172A]/20 shadow-2xs">
            <CheckSquare className="w-2.5 h-2.5 stroke-[2.5]" />
          </span>
        );
    }
  };

  const formatDueDate = (dateStr?: string) => {
    if (!dateStr) return 'Oct 6, 2026';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  if (isLoading || isLoadingSprints) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4 pt-2 dark-scrollbar">
        {columns.map((col) => (
          <KanbanColumnSkeleton key={col.id} />
        ))}
      </div>
    );
  }

  const plannedSprints = sprints.filter((s: any) => s._id !== currentSprint?._id && s.status !== 'COMPLETED');

  return (
    <div className="flex flex-col gap-3 select-none text-[#111827] w-full min-w-0">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs shrink-0">
        <div className="flex items-center flex-wrap gap-2 sm:gap-2.5">
          {/* Search Board Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search board..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="pl-8 pr-7 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 w-36 sm:w-56 font-medium transition-all"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                title="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Member Avatar Filter */}
          <div className="relative flex items-center -space-x-1 pl-1">
            <button
              onClick={() => {
                setSelectedAssigneeFilter(null);
                setIsMembersDropdownOpen(false);
              }}
              className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center border transition-all cursor-pointer ${
                selectedAssigneeFilter === null
                  ? 'bg-slate-800 text-white border-slate-800 shadow-xs z-10'
                  : 'bg-slate-100 text-slate-500 border-slate-200 hover:text-slate-800 hover:bg-slate-200'
              }`}
              title={`All (${Object.values(memberTaskCounts).reduce((a: number, b: number) => a + b, 0)} tasks)`}
            >
              All
            </button>
            {boardMembers.slice(0, 2).map((m: any) => {
              const isSelected = selectedAssigneeFilter === m._id;
              const count = memberTaskCounts[m._id] || 0;
              return (
                <button
                  key={m._id}
                  onClick={() => {
                    setSelectedAssigneeFilter(isSelected ? null : m._id);
                    setIsMembersDropdownOpen(false);
                  }}
                  className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center border uppercase transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs z-10 scale-105 ring-2 ring-blue-400/50'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-200'
                  }`}
                  title={`${m.name || m.email} • ${count} ${count === 1 ? 'task' : 'tasks'}`}
                >
                  {(m.name || m.email || 'U').charAt(0).toUpperCase()}
                </button>
              );
            })}

            {/* +N More Members Button */}
            {boardMembers.length > 2 && (
              <div className="relative" ref={membersDropdownRef}>
                {(() => {
                  const extraMembers = boardMembers.slice(2);
                  const isExtraSelected = extraMembers.some((m: any) => m._id === selectedAssigneeFilter);
                  return (
                    <button
                      onClick={() => setIsMembersDropdownOpen(!isMembersDropdownOpen)}
                      className={`w-7 h-7 rounded-full text-[10px] font-bold flex items-center justify-center border transition-all cursor-pointer ${
                        isExtraSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs z-10 ring-2 ring-blue-400/50'
                          : isMembersDropdownOpen
                          ? 'bg-slate-800 text-white border-slate-800 shadow-xs z-10'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-200'
                      }`}
                      title={`${boardMembers.length - 2} more members`}
                    >
                      +{boardMembers.length - 2}
                    </button>
                  );
                })()}

                {/* Dropdown Menu for extra members */}
                {isMembersDropdownOpen && (
                  <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50">
                    <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        More Members ({boardMembers.length - 2})
                      </span>
                      {memberSearch && (
                        <button
                          onClick={() => setMemberSearch('')}
                          className="text-[10px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Member Search Input */}
                    <div className="p-2 border-b border-slate-100 bg-slate-50/60">
                      <div className="relative flex items-center">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder="Search members..."
                          autoFocus
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1.5 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 text-slate-700"
                        />
                        {memberSearch && (
                          <button
                            onClick={() => setMemberSearch('')}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-600 cursor-pointer text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="max-h-56 overflow-y-auto py-1 divide-y divide-slate-50">
                      {(() => {
                        const filteredMembers = boardMembers.slice(2).filter((m: any) => {
                          const q = memberSearch.toLowerCase().trim();
                          if (!q) return true;
                          const name = (m.name || '').toLowerCase();
                          const email = (m.email || '').toLowerCase();
                          return name.includes(q) || email.includes(q);
                        });

                        if (filteredMembers.length === 0) {
                          return (
                            <div className="py-6 px-3 text-center text-xs text-slate-400">
                              No members found matching &ldquo;{memberSearch}&rdquo;
                            </div>
                          );
                        }

                        return filteredMembers.map((m: any) => {
                          const isSelected = selectedAssigneeFilter === m._id;
                          const count = memberTaskCounts[m._id] || 0;
                          return (
                            <button
                              key={m._id}
                              onClick={() => {
                                setSelectedAssigneeFilter(isSelected ? null : m._id);
                                setIsMembersDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-50 text-blue-700 font-semibold'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold uppercase shrink-0 border ${
                                    isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                      : 'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {(m.name || m.email || 'U').charAt(0).toUpperCase()}
                                </span>
                                <div className="truncate">
                                  <p className="truncate text-xs font-medium leading-tight">{m.name || 'Member'}</p>
                                  {m.email && (
                                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{m.email}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    count > 0
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  {count} {count === 1 ? 'task' : 'tasks'}
                                </span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clear Filter Badge if filter is active */}
          {selectedAssigneeFilter && (
            <button
              onClick={() => setSelectedAssigneeFilter(null)}
              className="px-2 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>Filtered: {boardMembers.find((m: any) => m._id === selectedAssigneeFilter)?.name || members.find((m: any) => m._id === selectedAssigneeFilter)?.name || 'Member'}</span>
              <span className="text-blue-400 hover:text-blue-700 font-bold">✕</span>
            </button>
          )}

          {/* Discipline Workflow Dropdown Selector */}
          {projectTeams && projectTeams.length > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs transition-all">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <select
                  value={selectedTeamFilter}
                  onChange={(e) => setSelectedTeamFilter(e.target.value)}
                  className="text-xs bg-transparent font-bold text-slate-800 outline-none cursor-pointer pr-1"
                >
                  <option value="ALL">🌐 All Teams (Unified View)</option>
                  {projectTeams.map((tm: any) => {
                    const stageCount = tm.workflowStages?.length || 5;
                    const isMyTeam = (detectedUserTeam as any)?._id === tm._id || (detectedUserTeam as any)?.name === tm.name;
                    return (
                      <option key={tm._id || tm.name} value={tm.name}>
                        {isMyTeam ? `⭐ ${tm.name} (My Team)` : `${tm.name} (${stageCount} Stages)`}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {/* Horizontal Scroll Arrow Controls */}
          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={handleScrollLeft}
              title="Scroll Board Left"
              className="p-1 hover:bg-white text-slate-500 hover:text-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleScrollRight}
              title="Scroll Board Right"
              className="p-1 hover:bg-white text-slate-500 hover:text-slate-800 rounded-md transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>


          {/* Primary Create Task Action */}
          {canCreateTask ? (
            <button
              onClick={() =>
                onOpenCreateTask(
                  columns[0]?.id || 'TODO',
                  resolveLeadTeamForCreate(selectedTeam?.name || (selectedTeamFilter && selectedTeamFilter !== 'ALL' ? selectedTeamFilter : undefined)),
                  currentSprint?._id
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer active:scale-[0.98]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Task</span>
            </button>
          ) : isLevel3 && !isLevel1 && !isLevel2 && !isCurrentFilterMyLeadTeam ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100/90 border border-slate-200/90 rounded-lg text-xs font-semibold text-slate-600 select-none shadow-2xs"
              title="You are viewing another team's board. Switch the team filter to your team to create tasks."
            >
              <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="hidden sm:inline">Other Team (Read-Only)</span>
            </div>
          ) : null}

          {/* Add Stage Action */}
          {canManageColumns && (
            <button
              onClick={() => setIsAddColumnModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200/80 transition-colors cursor-pointer"
              title="Add a new workflow stage to this board"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>Add stage</span>
            </button>
          )}

          {/* Excel Project Plan Upload Button on Board Page */}
          <button
            onClick={() => setIsExcelImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer active:scale-[0.98]"
            title="Import Project Plan / Tasks from Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">Import Excel</span>
            <span className="sm:hidden">Import</span>
          </button>

          {/* Excel Project Plan Export Button on Board Page */}
          <button
            onClick={handleExportToExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
            title="Export all existing project tasks and subtasks with Task IDs to Excel"
          >
            {isExportingExcel ? (
              <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-white" />
            )}
            <span className="hidden sm:inline">{isExportingExcel ? 'Exporting...' : 'Export Excel'}</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>

        {/* Right Actions: Complete sprint, Sprint Switcher & Schedule / History */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Sprint Days Left / Schedule Badge */}
          {currentSprint && currentSprint.endDate && (() => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const end = new Date(currentSprint.endDate);
            end.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isOverdue = diffDays < 0;
            const isEndingToday = diffDays === 0;
            const isEndingTomorrow = diffDays === 1;

            return (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    if (!canManageSprint) return;
                    setEditSprintName(currentSprint.name || '');
                    setEditSprintGoal(currentSprint.goal || '');
                    setEditSprintStartDate(
                      currentSprint.startDate
                        ? new Date(currentSprint.startDate).toISOString().split('T')[0]
                        : ''
                    );
                    setEditSprintEndDate(
                      currentSprint.endDate
                        ? new Date(currentSprint.endDate).toISOString().split('T')[0]
                        : ''
                    );
                    setEditSprintReason('');
                    setIsEditSprintModalOpen(true);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    canManageSprint ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    isOverdue
                      ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 hover:border-rose-300'
                      : isEndingToday || isEndingTomorrow
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300'
                  }`}
                  title={canManageSprint ? "Click to edit dates or extend sprint" : undefined}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {isOverdue
                      ? `${Math.abs(diffDays)}d overdue${canManageSprint ? ' (Extend)' : ''}`
                      : isEndingToday
                      ? `Ends today${canManageSprint ? ' (Extend)' : ''}`
                      : isEndingTomorrow
                      ? '1 day left'
                      : `${diffDays} days left`}
                  </span>
                  {canManageSprint && <Edit2 className="w-3 h-3 opacity-60 ml-0.5" />}
                </button>

                {/* Sprint History Button */}
                {currentSprint.history && currentSprint.history.length > 0 && (
                  <button
                    onClick={() => setIsSprintHistoryModalOpen(true)}
                    className="p-1.5 text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-lg transition-colors cursor-pointer"
                    title="View sprint extension & audit history"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })()}

          <select
            value={currentSprint ? currentSprint._id : selectedSprintId}
            onChange={(e) => setSelectedSprintId(e.target.value)}
            className="text-xs bg-slate-50 hover:bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 outline-none focus:border-blue-500 cursor-pointer shadow-2xs transition-colors"
          >
            <option value="ALL">All Sprints</option>
            {sprints.map((s: any) => (
              <option key={s._id} value={s._id}>
                {s.name} {s.status === 'ACTIVE' ? '(Active)' : `• [${s.status}]`}
              </option>
            ))}
          </select>

          {canManageSprint && currentSprint && currentSprint.status === 'ACTIVE' && (
            <button
              onClick={() => setIsCompleteSprintModalOpen(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold text-xs rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>Complete sprint</span>
            </button>
          )}

          {canManageSprint && (
            <button
              onClick={() => {
                const today = new Date();
                const twoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
                setNewSprintStartDate(today.toISOString().split('T')[0]);
                setNewSprintEndDate(twoWeeks.toISOString().split('T')[0]);
                setNewSprintName(`Sprint ${sprints.length + 1}`);
                setNewSprintGoal('');
                setIsNewSprintModalOpen(true);
              }}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              title="Create Sprint"
            >
              <Plus className="w-3.5 h-3.5 text-slate-600" />
            </button>
          )}
        </div>
      </div>

      {/* Horizontal Scrollable Columns Container */}
      <div
        ref={boardScrollRef}
        onScroll={handleBoardScroll}
        className="flex gap-3.5 overflow-x-auto pb-2 pt-1 h-[calc(100vh-250px)] max-h-[calc(100vh-250px)] dark-scrollbar w-full min-w-0"
        style={{ scrollBehavior: 'smooth' }}
      >
        {(() => {
          const activeColumns = columns && columns.length > 0 ? columns : DEFAULT_COLUMNS;

          // All tasks flattened across board
          const allTasksList: Task[] = [];
          if (data) {
            Object.values(data).forEach((taskList: any) => {
              if (Array.isArray(taskList)) allTasksList.push(...taskList);
            });
          }

          // Team filter helper
          const matchesTeamFilter = (taskTeam?: string) => {
            if (!selectedTeamFilter || selectedTeamFilter === 'ALL') return true;
            const taskTeamLower = (taskTeam || '').toLowerCase().trim();
            const filterLower = selectedTeamFilter.toLowerCase().trim();
            const teamKey = (selectedTeam?.key || '').toLowerCase().trim();
            return (
              taskTeamLower === filterLower ||
              taskTeamLower.includes(filterLower) ||
              filterLower.includes(taskTeamLower) ||
              (teamKey && taskTeamLower === teamKey)
            );
          };

          // Completely dynamic stage matcher (zero hardcoded stage names!)
          const matchesStage = (statusVal?: string, targetColId?: string, targetColIdx?: number) => {
            if (!statusVal) return targetColIdx === 0;
            if (statusVal === targetColId) return true;
            if (statusVal.toUpperCase() === targetColId?.toUpperCase()) return true;
            const colObj = activeColumns.find((c) => c.id === targetColId);
            if (colObj && statusVal.toLowerCase() === colObj.label.toLowerCase()) return true;
            const existsInCols = activeColumns.some(
              (c) => c.id === statusVal || c.id.toUpperCase() === statusVal.toUpperCase() || c.label.toLowerCase() === statusVal.toLowerCase()
            );
            if (!existsInCols && targetColIdx === 0) return true;
            return false;
          };

          return activeColumns.map((col, colIdx) => {
            // 1. Main tasks belonging to this column stage
            let colMainTasks = allTasksList.filter((task) => {
              if (!matchesTeamFilter(task.team)) return false;
              return matchesStage(task.status, col.id, colIdx);
            });

            // 2. Subtasks belonging to this column stage (outside main task)
            let colSubtasks: { parent: Task; subtask: Subtask }[] = [];
            allTasksList.forEach((parent) => {
              if (!matchesTeamFilter(parent.team)) return;
              if (Array.isArray(parent.subtasks)) {
                parent.subtasks.forEach((st) => {
                  const stStatus = st.status || (st.isCompleted ? activeColumns[activeColumns.length - 1]?.id : activeColumns[0]?.id);
                  if (matchesStage(stStatus, col.id, colIdx)) {
                    colSubtasks.push({ parent, subtask: st });
                  }
                });
              }
            });

            // 3. Microtasks belonging to this column stage (outside subtask)
            let colMicrotasks: { parent: Task; subtask: Subtask; microtask: any }[] = [];
            allTasksList.forEach((parent) => {
              if (!matchesTeamFilter(parent.team)) return;
              if (Array.isArray(parent.subtasks)) {
                parent.subtasks.forEach((st) => {
                  if (Array.isArray(st.microtasks)) {
                    st.microtasks.forEach((mic: any) => {
                      const micStatus = mic.status || (mic.isCompleted ? activeColumns[activeColumns.length - 1]?.id : activeColumns[0]?.id);
                      if (matchesStage(micStatus, col.id, colIdx)) {
                        colMicrotasks.push({ parent, subtask: st, microtask: mic });
                      }
                    });
                  }
                });
              }
            });

            // 4. Search query filter (Multi-term, case-insensitive substring matching across main tasks, subtasks & microtasks)
            const query = (localSearch || searchQuery).trim().toLowerCase();
            if (query) {
              const queryTerms = query.split(/\s+/).filter(Boolean);

              colMainTasks = colMainTasks.filter((t) => {
                const searchBlob = [
                  t.title || '',
                  t.key || '',
                  t.description || '',
                  (t as any).team || '',
                  t.priority || '',
                  t.status || '',
                  t.assigneeId?.name || '',
                  t.assigneeId?.email || '',
                  ...(t.labels || []),
                  ...(t.subtasks || []).flatMap((st: any) => [
                    st.title || '',
                    st.key || '',
                    st.description || '',
                    st.status || '',
                    st.assigneeId?.name || '',
                    st.assigneeId?.email || '',
                    ...(st.microtasks || []).flatMap((m: any) => [
                      m.title || '',
                      m.key || '',
                      m.description || '',
                      m.status || '',
                      m.assigneeId?.name || '',
                      m.assigneeId?.email || ''
                    ])
                  ])
                ].join(' ').toLowerCase();

                return queryTerms.every((term) => searchBlob.includes(term));
              });

              colSubtasks = colSubtasks.filter(({ parent, subtask }) => {
                const searchBlob = [
                  subtask.title || '',
                  subtask.key || '',
                  subtask.description || '',
                  subtask.status || '',
                  subtask.assigneeId?.name || '',
                  subtask.assigneeId?.email || '',
                  parent.title || '',
                  parent.key || '',
                  parent.description || '',
                  (parent as any).team || '',
                  ...(parent.labels || []),
                  ...(subtask.microtasks || []).flatMap((m: any) => [
                    m.title || '',
                    m.key || '',
                    m.description || '',
                    m.status || '',
                    m.assigneeId?.name || '',
                    m.assigneeId?.email || ''
                  ])
                ].join(' ').toLowerCase();

                return queryTerms.every((term) => searchBlob.includes(term));
              });

              colMicrotasks = colMicrotasks.filter(({ parent, subtask, microtask }) => {
                const searchBlob = [
                  microtask.title || '',
                  microtask.key || '',
                  microtask.description || '',
                  microtask.status || '',
                  microtask.assigneeId?.name || '',
                  microtask.assigneeId?.email || '',
                  subtask.title || '',
                  subtask.key || '',
                  subtask.description || '',
                  parent.title || '',
                  parent.key || '',
                  parent.description || '',
                  (parent as any).team || '',
                  ...(parent.labels || [])
                ].join(' ').toLowerCase();

                return queryTerms.every((term) => searchBlob.includes(term));
              });
            }

            // 5. Assignee filter
            if (selectedAssigneeFilter) {
              colMainTasks = colMainTasks.filter(
                (t) =>
                  t.assigneeId?._id === selectedAssigneeFilter ||
                  t.assigneeId === selectedAssigneeFilter
              );
              colSubtasks = colSubtasks.filter(
                ({ subtask }) =>
                  subtask.assigneeId?._id === selectedAssigneeFilter ||
                  subtask.assigneeId === selectedAssigneeFilter
              );
              colMicrotasks = colMicrotasks.filter(
                ({ microtask }) =>
                  microtask.assigneeId?._id === selectedAssigneeFilter ||
                  microtask.assigneeId === selectedAssigneeFilter
              );
            }

            const totalColItems = colMainTasks.length + colSubtasks.length + colMicrotasks.length;
            const isMenuOpen = openColumnMenuId === col.id;

            return (
              <div
                key={col.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.id)}
                className="flex-1 min-w-[260px] sm:min-w-[280px] md:min-w-[300px] max-w-[420px] bg-[#F4F5F7] border border-[#EBECF0] rounded-xl flex flex-col h-full max-h-full relative shadow-2xs transition-all"
              >
                {/* Column Header */}
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/column-index', String(colIdx));
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const srcIdxStr = e.dataTransfer.getData('text/column-index');
                    if (srcIdxStr !== '') {
                      e.stopPropagation();
                      const srcIdx = Number(srcIdxStr);
                      if (!isNaN(srcIdx) && srcIdx !== colIdx) {
                        const newCols = [...columns];
                        const [moved] = newCols.splice(srcIdx, 1);
                        newCols.splice(colIdx, 0, moved);
                        setColumns(newCols);
                        persistStagesMutation.mutate(newCols);
                      }
                    }
                  }}
                  className="px-3.5 py-2.5 flex items-center justify-between border-b border-[#EBECF0] cursor-grab active:cursor-grabbing select-none group/col shrink-0"
                  title="Drag column to reorder stage position"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="text-slate-400 group-hover/col:text-slate-700 transition-colors p-0.5" title="Drag column">
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    {editingColumnId === col.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={editColLabel}
                          onChange={(e) => setEditColLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRenameColumn(col.id);
                          }}
                          className="text-xs bg-white border border-blue-400 rounded-md px-2 py-0.5 text-slate-800 outline-none w-28 font-medium"
                        />
                        <button
                          onClick={() => handleSaveRenameColumn(col.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                          title="Save rename"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 capitalize tracking-normal truncate">
                        {col.label}
                      </h3>
                    )}
                    <span className="text-xs font-bold text-slate-600 bg-[#EBECF0] px-2 py-0.5 rounded-full shrink-0">
                      {totalColItems}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 text-slate-400 relative">
                    {canCreateTask && (
                      <button
                        onClick={() =>
                          onOpenCreateTask(
                            col.id,
                            resolveLeadTeamForCreate(selectedTeam?.name || (selectedTeamFilter && selectedTeamFilter !== 'ALL' ? selectedTeamFilter : undefined)),
                            currentSprint?._id
                          )
                        }
                        className="p-1 hover:text-slate-800 hover:bg-slate-200/80 rounded-md transition-colors cursor-pointer"
                        title="Add Issue"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Column Menu Button */}
                    {canManageColumns && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenColumnMenuId(isMenuOpen ? null : col.id);
                        }}
                        className="p-1 hover:text-slate-800 hover:bg-slate-200/80 rounded-md transition-colors cursor-pointer"
                        title="Column Options"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Dropdown Menu */}
                    {isMenuOpen && canManageColumns && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-7 z-30 w-44 bg-white border border-slate-200 rounded-xl shadow-xl p-1 flex flex-col gap-0.5 text-xs animate-slide-up"
                      >
                        <button
                          onClick={() => {
                            setEditingColumnId(col.id);
                            setEditColLabel(col.label);
                            setOpenColumnMenuId(null);
                          }}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 rounded-lg text-slate-700 flex items-center gap-2 transition-colors cursor-pointer font-medium"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Rename column</span>
                        </button>

                        {colIdx > 0 && (
                          <button
                            onClick={() => handleMoveColumn(colIdx, 'left')}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 rounded-lg text-slate-700 flex items-center gap-2 transition-colors cursor-pointer font-medium"
                          >
                            <MoveLeft className="w-3.5 h-3.5 text-slate-400" />
                            <span>Move left</span>
                          </button>
                        )}

                        {colIdx < columns.length - 1 && (
                          <button
                            onClick={() => handleMoveColumn(colIdx, 'right')}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-slate-100 rounded-lg text-slate-700 flex items-center gap-2 transition-colors cursor-pointer font-medium"
                          >
                            <MoveRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>Move right</span>
                          </button>
                        )}

                        {columns.length > 1 && (
                          <button
                            onClick={() => handleDeleteColumn(col.id)}
                            className="w-full text-left px-2.5 py-1.5 hover:bg-rose-50 text-rose-600 rounded-lg flex items-center gap-2 transition-colors cursor-pointer font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete column</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Column Cards Container: Main Tasks + Draggable Subtasks Outside Main Task */}
                <div className="p-2 flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 dark-scrollbar">
                  {/* SECTION 1: MAIN TASKS IN THIS COLUMN */}
                  {colMainTasks.map((task) => {
                    const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
                    const canDrag = canDragTask(task);

                    return (
                      <div
                        key={task._id}
                        draggable={canDrag}
                        onDragStart={(e) => canDrag ? handleDragStart(e, task._id) : e.preventDefault()}
                        onClick={() => onSelectTask(task)}
                        className={`bg-white hover:bg-white p-3 rounded-lg border ${
                          hasSubtasks ? 'border-amber-200/90 shadow-xs' : 'border-[#DFE1E6]'
                        } hover:border-[#4C9AFF] shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${
                          canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } group flex flex-col gap-2 relative text-slate-800`}
                      >
                        {/* Drag Grip Handle on hover & Quick Delete Button */}
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
                          {canDeleteTask(task) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTaskToDelete(task);
                              }}
                              title="Move to Recycle Bin (30-day retention)"
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <div className="opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 pointer-events-none">
                            {canDrag ? (
                              <GripVertical className="w-3.5 h-3.5" />
                            ) : (
                              <span title={hasSubtasks ? "Automated Stage: Main task stage updates automatically as its subtasks are dragged across columns" : "Stage change restricted"}>
                                <Lock className="w-3.5 h-3.5 text-amber-600" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Top Badge: Main Task Indicator / Issue Type & Key */}
                        <div className="flex items-center gap-1.5 flex-wrap pr-5">
                          {hasSubtasks ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1 shadow-2xs">
                              <span>👑</span>
                              <span>MAIN TASK</span>
                            </span>
                          ) : task.issueType === 'BUG' ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 flex items-center gap-1 shadow-2xs">
                              <Bug className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>BUG</span>
                            </span>
                          ) : task.issueType === 'STORY' ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1 shadow-2xs">
                              <BookmarkCheck className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>STORY</span>
                            </span>
                          ) : task.issueType === 'EPIC' ? (
                            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1 shadow-2xs">
                              <Layers className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>EPIC</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1 shadow-2xs">
                              <CheckSquare className="w-2.5 h-2.5 stroke-[2.5]" />
                              <span>TASK</span>
                            </span>
                          )}
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {task.key}
                          </span>
                        </div>

                        {/* Main Task Title */}
                        <h4 className="text-sm font-bold text-slate-900 line-clamp-2 leading-snug">
                          {task.title}
                        </h4>

                        {/* Due Date */}
                        {task.dueDate && (
                          <div className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatDueDate(task.dueDate)}</span>
                          </div>
                        )}

                        {/* Team & Labels Badges */}
                        {((task as any).team || (task.labels && task.labels.length > 0)) && (
                          <div className="flex flex-wrap items-center gap-1">
                            {(task as any).team && (
                              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                {(task as any).team}
                              </span>
                            )}
                            {task.labels && task.labels.slice(0, 2).map((l, idx) => (
                              <span
                                key={idx}
                                className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200"
                              >
                                #{l}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* If Main Task has subtasks: show Live Progress Bar & Subtask Stages Breakdown */}
                        {hasSubtasks && (() => {
                          const completedCount = task.subtasks!.filter((st) => st.isCompleted).length;
                          const totalCount = task.subtasks!.length;
                          const percent = Math.round((completedCount / totalCount) * 100);

                          return (
                            <div className="bg-amber-50/50 rounded-lg p-2 border border-amber-200/60 flex flex-col gap-1.5 cursor-pointer">
                              <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                                <span className="flex items-center gap-1">
                                  <CheckSquare className="w-3 h-3 text-amber-700" />
                                  <span>Subtasks Progress ({completedCount}/{totalCount})</span>
                                </span>
                                <span className={percent === 100 ? 'text-emerald-700 font-black' : 'text-amber-800'}>
                                  {percent}%
                                </span>
                              </div>

                              {/* Progress bar */}
                              <div className="w-full h-1.5 bg-amber-200/60 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${percent === 100 ? 'bg-emerald-500' : 'bg-amber-600'}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>

                              {/* Dynamic stages breakdown pills */}
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                {activeColumns.map((stg) => {
                                  const count = task.subtasks!.filter((st) => matchesStage(st.status || activeColumns[0]?.id, stg.id)).length;
                                  if (count === 0) return null;
                                  return (
                                    <span
                                      key={stg.id}
                                      className="text-[10px] font-semibold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs"
                                    >
                                      {count} {stg.label}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Bottom Row: Key Badge + Icon & Assignee Avatar */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <div className="flex items-center gap-1.5">
                            {getTypeIcon(task.issueType)}
                            <span className="font-mono font-bold text-slate-500 text-xs">
                              {task.key}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {task.assigneeId ? (
                              <div
                                title={`Assigned to ${task.assigneeId.name}`}
                                className="w-6 h-6 rounded-full bg-[#0052CC] text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs"
                              >
                                {task.assigneeId.name.charAt(0)}
                              </div>
                            ) : (
                              <div
                                title="Unassigned"
                                className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs"
                              >
                                <UserIcon className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* SECTION 2: SUBTASKS DISPLAYED OUTSIDE MAIN TASK AS DRAGGABLE CARDS */}
                  {colSubtasks.map(({ parent, subtask: st }) => {
                    const hasMicrotasks = Array.isArray(st.microtasks) && st.microtasks.length > 0;
                    const canDrag = canDragSubtask(parent, st);

                    return (
                      <div
                        key={`${parent._id}-${st._id}`}
                        draggable={canDrag}
                        onDragStart={(e) => canDrag ? handleDragStart(e, parent._id, st._id) : e.preventDefault()}
                        onClick={() => onSelectTask(parent, { targetSubtaskId: st._id })}
                        className={`bg-white hover:bg-white p-3 rounded-lg border-l-4 border-l-indigo-600 border-t border-r border-b border-[#DFE1E6] hover:border-indigo-400 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${
                          canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } group flex flex-col gap-2 relative text-slate-800`}
                      >
                        {/* Drag Handle on hover */}
                        <div className="absolute top-2.5 right-2.5 opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 pointer-events-none">
                          {canDrag ? (
                            <GripVertical className="w-3.5 h-3.5" />
                          ) : (
                            <span title={hasMicrotasks ? "Automated Stage: Subtask stage updates automatically as its microtasks are dragged across columns" : "Stage change restricted"}>
                              <Lock className="w-3.5 h-3.5 text-indigo-600" />
                            </span>
                          )}
                        </div>

                        {/* Subtask Badge & Key */}
                        <div className="flex items-center gap-1.5 flex-wrap pr-5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1 shadow-2xs">
                            <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                            <span>SUBTASK</span>
                          </span>
                          {st.key && (
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {st.key}
                            </span>
                          )}
                        </div>

                        {/* Parent Main Task Link Context Pill */}
                        <div
                          title={`Part of Main Task: ${parent.key} - ${parent.title}`}
                          className="text-[11px] font-medium text-slate-600 flex items-center gap-1 truncate bg-slate-50 px-2 py-1 rounded border border-slate-200/80"
                        >
                          <CornerDownRight className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span className="font-bold text-slate-800 shrink-0">↳ Main {parent.key}:</span>
                          <span className="truncate text-slate-600">{parent.title}</span>
                        </div>

                        {/* Subtask Title */}
                        <h5 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                          {st.title}
                        </h5>

                        {/* Subtask Microtasks Progress Pill */}
                        {st.microtasks && st.microtasks.length > 0 && (() => {
                          const micDone = st.microtasks.filter((m: any) => m.isCompleted || m.status === 'DONE').length;
                          const micTotal = st.microtasks.length;
                          const micPct = Math.round((micDone / micTotal) * 100);
                          return (
                            <div className="bg-purple-50/70 rounded px-2 py-1 border border-purple-200/70 flex items-center justify-between text-[10px]">
                              <span className="font-bold text-purple-900 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                <span>Microtasks ({micDone}/{micTotal})</span>
                              </span>
                              <span className="font-extrabold text-purple-700">{micPct}%</span>
                            </div>
                          );
                        })()}

                        {/* Subtask Bottom Row: Stage Pill, Due Date Badge, Assignee Avatar */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200">
                              {col.label}
                            </span>
                            {st.dueDate && (
                              <span
                                title={`Due Date: ${new Date(st.dueDate).toLocaleDateString()}`}
                                className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-slate-200"
                              >
                                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                <span>{new Date(st.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {st.assigneeId ? (
                              <div
                                title={`Assigned to ${st.assigneeId.name || 'Member'}`}
                                className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] uppercase shadow-2xs"
                              >
                                {(st.assigneeId.name || 'M').charAt(0)}
                              </div>
                            ) : (
                              <div
                                title="Unassigned"
                                className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px]"
                              >
                                <UserIcon className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* SECTION 3: MICROTASKS DISPLAYED AS DRAGGABLE CARDS */}
                  {colMicrotasks.map(({ parent, subtask: st, microtask: mic }) => {
                    const canDrag = canDragMicrotask(parent, st, mic);

                    return (
                      <div
                        key={`${parent._id}-${st._id}-${mic._id}`}
                        draggable={canDrag}
                        onDragStart={(e) => canDrag ? handleDragStart(e, parent._id, st._id, mic._id) : e.preventDefault()}
                        onClick={() => onSelectTask(parent, { targetSubtaskId: st._id, targetMicrotaskId: mic._id })}
                        className={`bg-white hover:bg-white p-3 rounded-lg border-l-4 border-l-purple-600 border-t border-r border-b border-[#DFE1E6] hover:border-purple-400 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${
                          canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } group flex flex-col gap-2 relative text-slate-800`}
                      >
                        {/* Drag Handle on hover */}
                        <div className="absolute top-2.5 right-2.5 opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 pointer-events-none">
                          {canDrag ? (
                            <GripVertical className="w-3.5 h-3.5" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </div>

                        {/* Microtask Badge & Key */}
                        <div className="flex items-center gap-1.5 flex-wrap pr-5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1 shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                            <span>MICRO-TASK</span>
                          </span>
                          {mic.key && (
                            <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {mic.key}
                            </span>
                          )}
                        </div>

                        {/* Parent Subtask & Main Task Breadcrumb Pill */}
                        <div
                          title={`Part of Subtask: ${st.title} (Main Task: ${parent.key} - ${parent.title})`}
                          className="text-[11px] font-medium text-slate-600 flex items-center gap-1 truncate bg-purple-50/50 px-2 py-1 rounded border border-purple-100"
                        >
                          <CornerDownRight className="w-3 h-3 text-purple-500 shrink-0" />
                          <span className="font-bold text-slate-800 shrink-0">↳ Sub: {st.key || st.title}</span>
                          <span className="text-slate-400">·</span>
                          <span className="truncate text-slate-500">Main {parent.key}</span>
                        </div>

                        {/* Microtask Title */}
                        <h5 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">
                          {mic.title}
                        </h5>

                        {/* Microtask Bottom Row: Stage Pill, Due Date Badge, Assignee Avatar */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-purple-700 bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-200">
                              {col.label}
                            </span>
                            {mic.dueDate && (
                              <span
                                title={`Due Date: ${new Date(mic.dueDate).toLocaleDateString()}`}
                                className="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded flex items-center gap-1 border border-slate-200"
                              >
                                <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                <span>{new Date(mic.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {mic.assigneeId ? (
                              <div
                                title={`Assigned to ${mic.assigneeId.name || 'Member'}`}
                                className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-[10px] uppercase shadow-2xs"
                              >
                                {(mic.assigneeId.name || 'M').charAt(0)}
                              </div>
                            ) : (
                              <div
                                title="Unassigned"
                                className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-[10px]"
                              >
                                <UserIcon className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Column Create Button */}
                  {canCreateTask && (
                    <button
                      onClick={() =>
                        onOpenCreateTask(
                          col.id,
                          resolveLeadTeamForCreate(selectedTeam?.name || (selectedTeamFilter && selectedTeamFilter !== 'ALL' ? selectedTeamFilter : undefined)),
                          currentSprint?._id
                        )
                      }
                      className="w-full text-left p-2 rounded-lg text-xs text-slate-500 hover:text-slate-900 hover:bg-[#EBECF0]/80 flex items-center gap-1.5 transition-colors cursor-pointer mt-0.5 font-medium shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-500" />
                      <span>Create</span>
                    </button>
                  )}
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Add Custom Stage Modal */}
      {isAddColumnModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#DFE1E6] rounded-2xl shadow-2xl w-full max-w-md p-6 text-[#172B4D] my-auto">
            <h3 className="text-sm font-bold text-[#172B4D] mb-1 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Add Custom Board Stage</span>
            </h3>
            <p className="text-xs text-[#5E6C84] mb-4">
              Add a new workflow stage to this board.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                Stage Title
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. QA, Staging, Blocked, Deployed"
                value={newColLabel}
                onChange={(e) => setNewColLabel(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
              />
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setIsAddColumnModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#5E6C84] hover:text-[#172B4D] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                Add Stage
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* New Sprint Modal */}
      {isNewSprintModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#DFE1E6] rounded-2xl shadow-2xl w-full max-w-lg p-6 text-[#172B4D] my-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Create New Sprint</span>
              </h3>
              <button
                onClick={() => setIsNewSprintModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#5E6C84] mb-4">
              Configure sprint cycle dates and target deliverables.
            </p>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Sprint Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={`Sprint ${sprints.length + 1}`}
                  value={newSprintName}
                  onChange={(e) => setNewSprintName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newSprintStartDate}
                    onChange={(e) => setNewSprintStartDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newSprintEndDate}
                    onChange={(e) => setNewSprintEndDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium cursor-pointer"
                  />
                </div>
              </div>

              {/* Duration Calculation & Quick Preset Buttons */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {(() => {
                      if (!newSprintStartDate || !newSprintEndDate) return '14 days';
                      const start = new Date(newSprintStartDate);
                      const end = new Date(newSprintEndDate);
                      const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                      return `${diff} days duration`;
                    })()}
                  </span>
                </div>

                {/* Preset Cadence Quick Buttons */}
                <div className="flex items-center gap-1">
                  {[
                    { label: '1 Wk', days: 7 },
                    { label: '2 Wks', days: 14 },
                    { label: '3 Wks', days: 21 },
                    { label: '4 Wks', days: 28 }
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const base = newSprintStartDate ? new Date(newSprintStartDate) : new Date();
                        const nextEnd = new Date(base.getTime() + preset.days * 24 * 60 * 60 * 1000);
                        setNewSprintEndDate(nextEnd.toISOString().split('T')[0]);
                      }}
                      className="px-2 py-0.5 text-[10px] font-bold bg-white hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 border border-slate-200 rounded-md transition-colors cursor-pointer text-slate-600"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Sprint Goal (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Authentication overhaul, payment integration, sprint releases"
                  value={newSprintGoal}
                  onChange={(e) => setNewSprintGoal(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setIsNewSprintModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#5E6C84] hover:text-[#172B4D] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => createSprintMutation.mutate()}
                disabled={createSprintMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 cursor-pointer shadow-xs transition-all"
              >
                {createSprintMutation.isPending ? 'Creating...' : 'Create Sprint'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit / Extend Sprint Modal */}
      {isEditSprintModalOpen && currentSprint && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#DFE1E6] rounded-2xl shadow-2xl w-full max-w-lg p-6 text-[#172B4D] my-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Edit / Extend {currentSprint.name}</span>
              </h3>
              <button
                onClick={() => setIsEditSprintModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#5E6C84] mb-4">
              Adjust sprint timeline or extend dates with documented history tracking.
            </p>

            <div className="flex flex-col gap-3.5">
              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Sprint Name
                </label>
                <input
                  type="text"
                  value={editSprintName}
                  onChange={(e) => setEditSprintName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editSprintStartDate}
                    onChange={(e) => setEditSprintStartDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                    End Date (Extend)
                  </label>
                  <input
                    type="date"
                    value={editSprintEndDate}
                    onChange={(e) => setEditSprintEndDate(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium cursor-pointer"
                  />
                </div>
              </div>

              {/* Extension Diff Pill */}
              {(() => {
                if (!currentSprint.endDate || !editSprintEndDate) return null;
                const prevEnd = new Date(currentSprint.endDate);
                const nextEnd = new Date(editSprintEndDate);
                const diffDays = Math.round((nextEnd.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24));

                if (diffDays === 0) return null;

                return (
                  <div
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                      diffDays > 0
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-blue-50 text-blue-800 border-blue-200'
                    }`}
                  >
                    <span>
                      {diffDays > 0
                        ? `⏱️ Extending sprint by +${diffDays} days`
                        : `⏱️ Shortening sprint by ${Math.abs(diffDays)} days`}
                    </span>
                    <span className="text-[11px] font-normal opacity-80">
                      New End: {nextEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                );
              })()}

              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Reason for Extension / Schedule Change (Audit Log)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scope expansion, testing buffer, additional client deliverables"
                  value={editSprintReason}
                  onChange={(e) => setEditSprintReason(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Sprint Goal
                </label>
                <textarea
                  rows={2}
                  value={editSprintGoal}
                  onChange={(e) => setEditSprintGoal(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setIsEditSprintModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#5E6C84] hover:text-[#172B4D] rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => updateSprintMutation.mutate()}
                disabled={updateSprintMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 cursor-pointer shadow-xs transition-all"
              >
                {updateSprintMutation.isPending ? 'Saving...' : 'Save & Record History'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sprint History / Audit Trail Modal */}
      {isSprintHistoryModalOpen && currentSprint && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#DFE1E6] rounded-2xl shadow-2xl w-full max-w-lg p-6 text-[#172B4D] my-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-blue-600" />
                <span>{currentSprint.name} Schedule & Extension History</span>
              </h3>
              <button
                onClick={() => setIsSprintHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-[#5E6C84] mb-4">
              Complete chronological audit trail of all date changes and extensions.
            </p>

            <div className="max-h-80 overflow-y-auto pr-1 space-y-3">
              {(!currentSprint.history || currentSprint.history.length === 0) ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No previous date changes recorded for this sprint.
                </div>
              ) : (
                currentSprint.history.map((item: any, idx: number) => {
                  const changedDate = item.createdAt ? new Date(item.createdAt) : new Date();
                  const isExtension = item.action === 'EXTENDED' || (item.daysExtended && item.daysExtended > 0);

                  return (
                    <div
                      key={item._id || idx}
                      className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isExtension
                                ? 'bg-amber-100 text-amber-800'
                                : item.action === 'CREATED'
                                ? 'bg-blue-100 text-blue-800'
                                : item.action === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {item.action === 'EXTENDED'
                              ? `EXTENDED (+${item.daysExtended || 0}d)`
                              : item.action}
                          </span>
                          <span className="font-medium text-slate-700">
                            {item.changedBy?.name || item.changedBy?.email || 'Team Member'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {changedDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Dates comparison */}
                      <div className="text-[11px] text-slate-600 flex items-center gap-2 flex-wrap">
                        {item.previousEndDate && (
                          <span>
                            Prev End:{' '}
                            <span className="line-through text-slate-400">
                              {new Date(item.previousEndDate).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </span>
                        )}
                        {item.newEndDate && (
                          <span className="font-semibold text-slate-800">
                            → New End:{' '}
                            {new Date(item.newEndDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        )}
                      </div>

                      {/* Reason / Note */}
                      {item.reason && (
                        <p className="text-xs text-slate-500 italic bg-white p-2 rounded-lg border border-slate-100">
                          &ldquo;{item.reason}&rdquo;
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={() => setIsSprintHistoryModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Complete Sprint Modal */}
      {isCompleteSprintModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#DFE1E6] rounded-2xl shadow-2xl w-full max-w-md p-6 text-[#172B4D] my-auto">
            <h3 className="text-sm font-bold text-[#172B4D] mb-1 flex items-center gap-2">
              <CheckCheck className="w-4 h-4 text-emerald-600" />
              <span>Complete {currentSprint?.name}</span>
            </h3>
            <p className="text-xs text-[#5E6C84] mb-4">
              Mark this sprint as completed. What would you like to do with unresolved open tasks?
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Move Incomplete Tasks To:
                </label>
                <select
                  value={nextSprintIdForIncomplete}
                  onChange={(e) => setNextSprintIdForIncomplete(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
                >
                  <option value="">Keep in project backlog</option>
                  {plannedSprints.map((s: any) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setIsCompleteSprintModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#5E6C84] hover:text-[#172B4D] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => completeSprintMutation.mutate()}
                disabled={completeSprintMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {completeSprintMutation.isPending ? 'Completing...' : 'Complete Sprint'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add New Team Modal */}
      {isAddTeamModalOpen && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white border border-[#DFE1E6] rounded-2xl shadow-2xl w-full max-w-lg p-6 text-[#172B4D] my-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#172B4D]">Add New Project Team</h3>
                  <p className="text-xs text-[#5E6C84]">Configure a discipline team with its own pipeline</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddTeamModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTeamName.trim()) return;
                createTeamMutation.mutate({
                  name: newTeamName.trim(),
                  key: newTeamKey.trim() || newTeamName.trim().slice(0, 3).toUpperCase(),
                  color: newTeamColor,
                  description: newTeamDescription,
                  leadId: newTeamLeadId || undefined
                });
              }}
              className="flex flex-col gap-3.5"
            >
              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Battery Systems, ML Analytics, Mechanical CAD"
                  value={newTeamName}
                  onChange={(e) => {
                    setNewTeamName(e.target.value);
                    if (!newTeamKey) {
                      setNewTeamKey(e.target.value.slice(0, 3).toUpperCase());
                    }
                  }}
                  required
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                    Team Code / Key
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BAT, CAD, AI"
                    value={newTeamKey}
                    onChange={(e) => setNewTeamKey(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                    Team Badge Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newTeamColor}
                      onChange={(e) => setNewTeamColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 p-0.5"
                    />
                    <span className="text-xs font-mono font-bold text-slate-700">{newTeamColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Team Lead (Optional)
                </label>
                <select
                  value={newTeamLeadId}
                  onChange={(e) => setNewTeamLeadId(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium"
                >
                  <option value="">-- Select Team Lead --</option>
                  {members.map((m: any) => {
                    const id = (typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id);
                    const name = m.name || (typeof m.userId === 'object' && m.userId?.name) || (m.email ? m.email.split('@')[0] : 'Member');
                    const email = m.email || (typeof m.userId === 'object' && m.userId?.email) || '';
                    const role = m.role || (typeof m.userId === 'object' && m.userId?.role) || m.jobTitle || '';
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
                <label className="block text-[11px] font-bold text-[#5E6C84] uppercase mb-1">
                  Scope & Description
                </label>
                <textarea
                  placeholder="Describe the discipline responsibilities, design deliverables, or lab test objectives..."
                  value={newTeamDescription}
                  onChange={(e) => setNewTeamDescription(e.target.value)}
                  rows={2}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[#172B4D] outline-none focus:bg-white focus:border-blue-500 font-medium resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddTeamModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#5E6C84] hover:text-[#172B4D] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTeamMutation.isPending || !newTeamName.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{createTeamMutation.isPending ? 'Creating...' : 'Create Team'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Floating Kanban Column Viewport Minimap Navigator (Matching User Screenshot) */}
      <div
        className="fixed bottom-6 right-8 z-40 bg-[#0F172A]/90 hover:bg-[#0F172A] backdrop-blur-md border border-gray-700/70 rounded-2xl px-2 py-1.5 shadow-2xl flex items-center gap-1 transition-all duration-200 select-none"
        title="Kanban Board Column Navigator"
      >
        <div className="relative flex items-center gap-1.5 h-7">
          {columns.map((col, idx) => (
            <button
              key={col.id}
              type="button"
              title={`Scroll to ${col.label}`}
              onClick={() => {
                if (boardScrollRef.current) {
                  const maxScroll = boardScrollRef.current.scrollWidth - boardScrollRef.current.clientWidth;
                  const targetScroll = columns.length > 1 ? (idx / (columns.length - 1)) * maxScroll : 0;
                  boardScrollRef.current.scrollTo({
                    left: targetScroll,
                    behavior: 'smooth'
                  });
                }
              }}
              className="w-4 sm:w-5 h-full rounded-md bg-gray-700/70 hover:bg-gray-600 transition-colors cursor-pointer"
            />
          ))}

          {/* Blue Floating Viewport Bounding Outline Box */}
          <div
            className="absolute top-0 bottom-0 border-2 border-blue-400 rounded-lg pointer-events-none transition-all duration-150 shadow-sm"
            style={{
              left: `${Math.max(
                0,
                Math.min(
                  80,
                  scrollMetrics.scrollWidth > scrollMetrics.clientWidth
                    ? (scrollMetrics.scrollLeft / (scrollMetrics.scrollWidth - scrollMetrics.clientWidth)) *
                        (100 - (scrollMetrics.clientWidth / scrollMetrics.scrollWidth) * 100)
                    : 0
                )
              )}%`,
              width: `${Math.min(100, Math.max(25, (scrollMetrics.clientWidth / Math.max(1, scrollMetrics.scrollWidth)) * 100))}%`
            }}
          />
        </div>
      </div>

      {/* Delete Task Confirmation Modal */}
      {taskToDelete && typeof document !== 'undefined' && createPortal(
        <DeleteConfirmModal
          isOpen={!!taskToDelete}
          onClose={() => setTaskToDelete(null)}
          onConfirm={() => deleteTaskMutation.mutateAsync(taskToDelete._id)}
          title="Move Task to Recycle Bin?"
          itemName={`${taskToDelete.key ? `[${taskToDelete.key}] ` : ''}${taskToDelete.title}`}
          itemType="Task"
          isLoading={deleteTaskMutation.isPending}
        />,
        document.body
      )}

      {/* Excel Project Plan & Timeline Import Modal */}
      {isExcelImportOpen && typeof document !== 'undefined' && createPortal(
        <ExcelImportModal
          isOpen={isExcelImportOpen}
          onClose={() => setIsExcelImportOpen(false)}
          projectId={projectId}
          projectKey={projectDetail?.key || 'PRJ'}
          defaultSprintName={currentSprint?.name || undefined}
          defaultTeam={selectedTeam?.name || (selectedTeamFilter && selectedTeamFilter !== 'ALL' ? selectedTeamFilter : undefined)}
        />,
        document.body
      )}
    </div>
  );
};
