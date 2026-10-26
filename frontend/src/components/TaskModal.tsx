'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { getBackendUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { formatSprintStatus } from '../lib/formatters';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { broadcastSyncEvent } from '../lib/crossTabSync';
import {
  X,
  Send,
  Trash2,
  Calendar,
  Layers,
  User,
  CheckCircle2,
  Tag,
  Plus,
  FolderKanban,
  AlertCircle,
  Loader2,
  Lock,
  Unlock,
  Eye,
  Share2,
  Maximize2,
  Minimize2,
  Edit3,
  Bug,
  BookmarkCheck,
  CheckSquare,
  Square,
  Clock,
  Timer,
  Settings,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Check,
  Paperclip,
  UploadCloud,
  File,
  FileImage,
  ExternalLink,
  Link as LinkIcon,
  Unlink,
  Download
} from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any | null; // null if creating new
  initialStatus?: string;
  initialTeam?: string;
  initialSprintId?: string;
  projectId: string;
  initialTargetSubtaskId?: string;
  initialTargetMicrotaskId?: string;
  initialTargetMinitaskId?: string;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  task,
  initialStatus = '',
  initialTeam = '',
  initialSprintId = '',
  projectId,
  initialTargetSubtaskId,
  initialTargetMicrotaskId,
  initialTargetMinitaskId
}) => {
  const queryClient = useQueryClient();
  const { user, projects, currentProject } = useAuthStore();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isEditing = !!task;

  // Active Project Selection
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projectId || task?.projectId?._id || task?.projectId || currentProject?._id || (projects && projects[0]?._id) || ''
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeActivityTab, setActiveActivityTab] = useState<'all' | 'comments' | 'history' | 'worklog'>('comments');
  const [copiedLink, setCopiedLink] = useState(false);

  // Form states
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [issueType, setIssueType] = useState(task?.issueType || 'TASK');
  const [priority, setPriority] = useState(task?.priority || 'MEDIUM');
  const [status, setStatus] = useState(task?.status || initialStatus || '');
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId?._id || task?.assigneeId || '');
  const [sprintId, setSprintId] = useState(task?.sprintId?._id || task?.sprintId || initialSprintId || '');
  const [labels, setLabels] = useState<string[]>(task?.labels || []);
  const [team, setTeam] = useState(task?.team || initialTeam || '');
  const [epic, setEpic] = useState(task?.epic || '');
  const [dueDate, setDueDate] = useState<string>(task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '');
  const [startDate, setStartDate] = useState<string>(task?.startDate ? new Date(task.startDate).toISOString().slice(0, 10) : '');
  const [customTagInput, setCustomTagInput] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState('');
  const [newSubtaskDescription, setNewSubtaskDescription] = useState('');
  const [newSubtaskStartDate, setNewSubtaskStartDate] = useState('');
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState('');
  const [newSubtaskStatus, setNewSubtaskStatus] = useState('');
  const [isAddSubtaskDetailsOpen, setIsAddSubtaskDetailsOpen] = useState(false);
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
  const [subtaskEditForm, setSubtaskEditForm] = useState<{
    title: string;
    description: string;
    startDate: string;
    dueDate: string;
    status: string;
    assigneeId: string;
  }>({ title: '', description: '', startDate: '', dueDate: '', status: '', assigneeId: '' });
  const [draftSubtasks, setDraftSubtasks] = useState<{
    title: string;
    description?: string;
    startDate?: string;
    dueDate?: string;
    status?: string;
    assigneeId?: string;
    assigneeName?: string;
    microtasks?: { title: string; assigneeId?: string; assigneeName?: string }[];
  }[]>([]);
  const [openDraftMicroIndex, setOpenDraftMicroIndex] = useState<number | null>(null);
  const [draftMicroTitle, setDraftMicroTitle] = useState('');
  const [draftMicroAssigneeId, setDraftMicroAssigneeId] = useState('');
  // Quick subtask date editing popovers
  const [activeDatePopoverId, setActiveDatePopoverId] = useState<string | null>(null);
  const [activeDraftDateIndex, setActiveDraftDateIndex] = useState<number | null>(null);
  const [datePopoverStart, setDatePopoverStart] = useState<string>('');
  const [datePopoverDue, setDatePopoverDue] = useState<string>('');
  const [commentText, setCommentText] = useState('');

  // Microtasks state
  const [newMicrotaskTitles, setNewMicrotaskTitles] = useState<Record<string, string>>({});
  const [newMicrotaskAssignees, setNewMicrotaskAssignees] = useState<Record<string, string>>({});
  const [isMicrotasksOpen, setIsMicrotasksOpen] = useState<Record<string, boolean>>({});

  // Mini-tasks state
  const [newMinitaskTitles, setNewMinitaskTitles] = useState<Record<string, string>>({});
  const [newMinitaskAssignees, setNewMinitaskAssignees] = useState<Record<string, string>>({});
  const [isMinitasksOpen, setIsMinitasksOpen] = useState<Record<string, boolean>>({});

  // Auto-scroll & blink highlight state for targeted subtasks, microtasks & mini-tasks
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setHighlightedItemId(null);
      return;
    }

    const currentSubtasks = task?.subtasks || [];

    if (initialTargetMicrotaskId) {
      // Auto-expand parent subtask and parent minitask
      let parentSubId: string | null = null;
      let parentMiniId: string | null = null;
      for (const s of currentSubtasks) {
        for (const m of (s.minitasks || [])) {
          if (
            (m.microtasks || []).some(
              (mic: any) => mic._id === initialTargetMicrotaskId || mic.key === initialTargetMicrotaskId
            )
          ) {
            parentSubId = s._id;
            parentMiniId = m._id;
            break;
          }
        }
        if (parentSubId) break;
      }

      if (parentSubId) {
        setIsMinitasksOpen((prev) => ({ ...prev, [parentSubId!]: true }));
      }
      if (parentMiniId) {
        setIsMicrotasksOpen((prev) => ({ ...prev, [parentMiniId!]: true }));
      }
      setHighlightedItemId(initialTargetMicrotaskId);

      const scrollTimer = setTimeout(() => {
        const el =
          document.getElementById(`microtask-${initialTargetMicrotaskId}`) ||
          document.querySelector(`[data-microtask-key="${initialTargetMicrotaskId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 350);

      const clearTimer = setTimeout(() => {
        setHighlightedItemId(null);
      }, 4000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    } else if (initialTargetMinitaskId) {
      // Auto-expand parent subtask
      const parentSub = currentSubtasks.find((s: any) =>
        (s.minitasks || []).some(
          (m: any) => m._id === initialTargetMinitaskId || m.key === initialTargetMinitaskId
        )
      );
      if (parentSub) {
        setIsMinitasksOpen((prev) => ({ ...prev, [parentSub._id]: true }));
      }
      setHighlightedItemId(initialTargetMinitaskId);

      const scrollTimer = setTimeout(() => {
        const el =
          document.getElementById(`minitask-${initialTargetMinitaskId}`) ||
          document.querySelector(`[data-minitask-key="${initialTargetMinitaskId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      const clearTimer = setTimeout(() => {
        setHighlightedItemId(null);
      }, 4000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    } else if (initialTargetSubtaskId) {
      setHighlightedItemId(initialTargetSubtaskId);

      const scrollTimer = setTimeout(() => {
        const el =
          document.getElementById(`subtask-${initialTargetSubtaskId}`) ||
          document.querySelector(`[data-subtask-key="${initialTargetSubtaskId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      const clearTimer = setTimeout(() => {
        setHighlightedItemId(null);
      }, 4000);

      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [isOpen, initialTargetSubtaskId, initialTargetMicrotaskId, initialTargetMinitaskId, task?._id]);

  // Worklog modal state
  const [isLogWorkOpen, setIsLogWorkOpen] = useState(false);
  const [logMinutes, setLogMinutes] = useState('60');
  const [logDesc, setLogDesc] = useState('');

  // Attachments & Lightbox state
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Task Linking state
  const [isLinkingOpen, setIsLinkingOpen] = useState(false);
  const [linkType, setLinkType] = useState<string>('blocks');
  const [targetTaskId, setTargetTaskId] = useState<string>('');

  // Details section collapse state
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);

  // Soft delete confirm modal state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Sync state when task or projectId prop changes
  useEffect(() => {
    setFormError(null);
    const targetProj = projectId || task?.projectId?._id || task?.projectId || currentProject?._id || (projects && projects[0]?._id) || '';
    setSelectedProjectId(targetProj);

    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setIssueType(task.issueType || 'TASK');
      setPriority(task.priority || 'MEDIUM');
      setStatus(task.status || '');
      setAssigneeId(task.assigneeId?._id || task.assigneeId || '');
      setSprintId(task.sprintId?._id || task.sprintId || '');
      setLabels(task.labels || []);
      setTeam(task.team || '');
      setEpic(task.epic || '');
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '');
      setStartDate(task.startDate ? new Date(task.startDate).toISOString().slice(0, 10) : '');
    } else {
      setTitle('');
      setDescription('');
      setIssueType('TASK');
      setPriority('MEDIUM');
      setStatus(initialStatus || '');
      setAssigneeId('');
      setSprintId(initialSprintId || '');
      setLabels([]);
      setTeam(initialTeam || '');
      setEpic('');
      setDueDate('');
      setStartDate('');
      setDraftSubtasks([]);
    }
  }, [task, initialStatus, initialTeam, initialSprintId, projectId, currentProject, projects]);

  const activeProjectId = selectedProjectId || projectId || currentProject?._id || (projects && projects[0]?._id) || '';

  // Fetch single task details if editing to get fresh subtasks, worklogs, etc.
  const { data: fullTask, refetch: refetchTask } = useQuery({
    queryKey: ['task-detail', task?._id],
    queryFn: async () => {
      if (!task?._id) return null;
      const res = await api.get(`/tasks/${task._id}`);
      return res.data.data;
    },
    enabled: isOpen && isEditing && !!task?._id
  });

  const activeTask = fullTask || task;

  // Helper to compute earliest start date and latest due date from subtasks
  const syncDatesFromSubtasks = (subtasksList: Array<{ startDate?: string | Date | null; dueDate?: string | Date | null }>) => {
    let minStart: string | null = null;
    let maxDue: string | null = null;
    subtasksList.forEach((st) => {
      if (st.startDate) {
        const s = typeof st.startDate === 'string' ? st.startDate.slice(0, 10) : new Date(st.startDate).toISOString().slice(0, 10);
        if (!minStart || s < minStart) minStart = s;
      }
      if (st.dueDate) {
        const d = typeof st.dueDate === 'string' ? st.dueDate.slice(0, 10) : new Date(st.dueDate).toISOString().slice(0, 10);
        if (!maxDue || d > maxDue) maxDue = d;
      }
    });
    return { minStart, maxDue };
  };

  // Synchronize parent dates when fullTask is refetched
  useEffect(() => {
    if (fullTask) {
      if (fullTask.startDate) {
        setStartDate(new Date(fullTask.startDate).toISOString().slice(0, 10));
      }
      if (fullTask.dueDate) {
        setDueDate(new Date(fullTask.dueDate).toISOString().slice(0, 10));
      }
    }
  }, [fullTask]);

  // Auto-sync main task Start Date & Due Date to encompass all draft subtask dates
  useEffect(() => {
    if (!isEditing && draftSubtasks.length > 0) {
      const { minStart, maxDue } = syncDatesFromSubtasks(draftSubtasks);
      if (minStart && (!startDate || minStart < startDate)) {
        setStartDate(minStart);
      }
      if (maxDue && (!dueDate || maxDue > dueDate)) {
        setDueDate(maxDue);
      }
    }
  }, [draftSubtasks, isEditing]);

  // Close date popovers on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveDatePopoverId(null);
      setActiveDraftDateIndex(null);
    };
    if (activeDatePopoverId !== null || activeDraftDateIndex !== null) {
      window.addEventListener('click', handleOutsideClick);
      return () => window.removeEventListener('click', handleOutsideClick);
    }
  }, [activeDatePopoverId, activeDraftDateIndex]);

  // Fetch project & workspace assignable members
  const { data: membersData } = useQuery({
    queryKey: ['project-members', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const res = await api.get(`/projects/${activeProjectId}/members`);
      return res.data.data;
    },
    enabled: isOpen && !!activeProjectId
  });

  // Fetch project details for dynamic workflow stages
  const { data: projectDetail } = useQuery({
    queryKey: ['project-detail', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null;
      const res = await api.get(`/projects/${activeProjectId}`);
      return res.data.data;
    },
    enabled: isOpen && !!activeProjectId
  });

  // Fetch project sprints
  const { data: sprintsData } = useQuery({
    queryKey: ['project-sprints', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const res = await api.get(`/projects/${activeProjectId}/sprints`);
      return res.data.data;
    },
    enabled: isOpen && !!activeProjectId
  });

  // Fetch project teams
  const { data: projectTeams = [] } = useQuery({
    queryKey: ['project-teams', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const res = await api.get(`/projects/${activeProjectId}/teams`);
      return res.data.data || [];
    },
    enabled: isOpen && !!activeProjectId
  });

  const activeTeamForStages = projectTeams.find(
    (t: any) =>
      t.name?.toLowerCase().trim() === team?.toLowerCase().trim() ||
      t._id === team ||
      t.key?.toLowerCase().trim() === team?.toLowerCase().trim()
  );

  const workflowStages = (activeTeamForStages?.workflowStages && activeTeamForStages.workflowStages.length > 0)
    ? activeTeamForStages.workflowStages
    : (projectDetail?.workflowStages && projectDetail.workflowStages.length > 0)
    ? projectDetail.workflowStages
    : [
        { id: 'BACKLOG', label: 'Idea', color: 'bg-slate-500' },
        { id: 'TODO', label: 'To Do', color: 'bg-blue-500' },
        { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-500' },
        { id: 'IN_REVIEW', label: 'Testing', color: 'bg-purple-500' },
        { id: 'DONE', label: 'Done', color: 'bg-emerald-500' }
      ];

  // Auto-sync status to initial status or first stage of current workflow
  useEffect(() => {
    if (workflowStages.length > 0) {
      if (!status || !workflowStages.some((s: any) => s.id === status)) {
        if (!isEditing) {
          setStatus(initialStatus || workflowStages[0].id);
        } else if (!status) {
          setStatus(workflowStages[0].id);
        }
      }
    }
  }, [workflowStages, status, initialStatus, isEditing]);

  // Fetch comments if editing
  const { data: commentsData, refetch: refetchComments } = useQuery({
    queryKey: ['comments', activeTask?._id],
    queryFn: async () => {
      if (!activeTask?._id) return [];
      const res = await api.get(`/tasks/${activeTask._id}/comments`);
      return res.data.data;
    },
    enabled: isEditing && !!activeTask?._id
  });

  // Fetch activities / history if editing
  const { data: activitiesData, refetch: refetchActivities } = useQuery({
    queryKey: ['activities', activeTask?._id],
    queryFn: async () => {
      if (!activeTask?._id) return [];
      const res = await api.get(`/tasks/${activeTask._id}/activities`);
      return res.data.data;
    },
    enabled: isEditing && !!activeTask?._id
  });

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

  const isLevel3 = user?.role === 'TEAM_LEAD' || userLeadTeamNames.size > 0;

  // Identify all teams led by current user in this project
  const myLeadTeams = React.useMemo(() => {
    if (!projectTeams || !Array.isArray(projectTeams)) return [];
    return projectTeams.filter((pt: any) => {
      const leadId = (pt.leadId?._id || pt.leadId)?.toString();
      if (leadId && leadId === currentUserIdStr) return true;
      if (pt.name && userLeadTeamNames.has(pt.name.toLowerCase().trim())) return true;
      if (pt.key && userLeadTeamNames.has(pt.key.toLowerCase().trim())) return true;
      return false;
    });
  }, [projectTeams, currentUserIdStr, userLeadTeamNames]);

  const hasLeadTeams = myLeadTeams.length > 0 || userLeadTeamNames.size > 0;

  // Auto-select active sprint if creating new issue and sprint is not yet selected
  useEffect(() => {
    if (!task && !sprintId && sprintsData && sprintsData.length > 0) {
      const active = sprintsData.find((s: any) => s.status === 'ACTIVE') || sprintsData[0];
      if (active?._id) {
        setSprintId(active._id);
      }
    }
  }, [task, sprintId, sprintsData]);

  // Strictly enforce team selection for Team Leads: auto-lock to their lead team
  useEffect(() => {
    if (!isEditing && isLevel3 && !isLevel1 && !isLevel2 && myLeadTeams.length > 0) {
      const isCurrentTeamInLead = myLeadTeams.some(
        (pt: any) => pt.name?.toLowerCase().trim() === (team || '').toLowerCase().trim()
      );
      if (!isCurrentTeamInLead) {
        setTeam(myLeadTeams[0].name);
      }
    } else if (!task && !team && projectTeams && projectTeams.length > 0 && currentUserIdStr) {
      const myLeadTeam = projectTeams.find((pt: any) => {
        const leadId = (pt.leadId?._id || pt.leadId)?.toString();
        return leadId && leadId === currentUserIdStr;
      });
      if (myLeadTeam?.name) {
        setTeam(myLeadTeam.name);
      }
    }
  }, [isEditing, isLevel3, isLevel1, isLevel2, myLeadTeams, task, team, projectTeams, currentUserIdStr]);

  // Identify currently selected team object from projectTeams
  const selectedTeamObj = React.useMemo(() => {
    if (!team || team === '__CUSTOM__') return null;
    const clean = team.toLowerCase().trim();
    return (
      projectTeams?.find(
        (pt: any) =>
          pt.name?.toLowerCase().trim() === clean ||
          pt.key?.toLowerCase().trim() === clean ||
          pt._id === team
      ) || null
    );
  }, [team, projectTeams]);

  // Compute assignable members: strictly the selected team's Lead and Members
  const assignableMembers = React.useMemo(() => {
    // If no specific team is selected (General / No Team / Custom), show all project members
    if (!selectedTeamObj) {
      return membersData || [];
    }

    const teamMemberIds = new Set<string>();
    const list: any[] = [];

    const addPerson = (person: any, forceRole?: string) => {
      if (!person) return;
      const id = (
        typeof person.userId === 'object' && person.userId?._id
          ? person.userId._id
          : person.userId || person._id || person
      )?.toString();

      if (!id || teamMemberIds.has(id)) return;
      teamMemberIds.add(id);

      // Look up full details from membersData (email, user avatar, roles, etc.)
      const fullFromMembers = membersData?.find((m: any) => {
        const mId = (
          typeof m.userId === 'object' && m.userId?._id
            ? m.userId._id
            : m.userId || m._id || m
        )?.toString();
        return mId === id;
      });

      const base = fullFromMembers || (typeof person === 'object' ? person : { _id: id, name: 'Team Member' });
      list.push(forceRole ? { ...base, roleOverride: forceRole } : base);
    };

    // 1. Add Team Lead first
    if (selectedTeamObj.leadId) {
      addPerson(selectedTeamObj.leadId, 'Team Lead');
    }

    // 2. Add Team Members
    if (Array.isArray(selectedTeamObj.members)) {
      selectedTeamObj.members.forEach((m: any) => addPerson(m));
    }

    // 3. Keep current assignee if editing
    if (isEditing && activeTask?.assigneeId) {
      addPerson(activeTask.assigneeId);
    }

    return list;
  }, [selectedTeamObj, membersData, isEditing, activeTask?.assigneeId]);

  // Clear assignee if current assignee doesn't belong to newly selected team
  useEffect(() => {
    if (selectedTeamObj && assigneeId && assignableMembers.length > 0) {
      const isMember = assignableMembers.some((m: any) => {
        const mId = (
          typeof m.userId === 'object' && m.userId?._id
            ? m.userId._id
            : m.userId || m._id || m
        )?.toString();
        return mId === assigneeId.toString();
      });
      if (!isMember) {
        setAssigneeId('');
      }
    }
  }, [selectedTeamObj, assignableMembers, assigneeId]);

  const isTaskAssignee = (activeTask?.assigneeId?._id || activeTask?.assigneeId)?.toString() === currentUserIdStr;
  const isTaskReporter = (activeTask?.reporterId?._id || activeTask?.reporterId)?.toString() === currentUserIdStr;
  const isLevel4 = !isLevel1 && !isLevel2 && !isLevel3 && !isGuest;
  const isMember = user?.role === 'MEMBER' || isLevel4;

  const isTeamLeadAllowed = isLevel3 && (
    isEditing
      ? (
          Boolean(activeTask?.team) &&
          (userLeadTeamNames.has((activeTask.team || '').toLowerCase().trim()) ||
            Array.from(userLeadTeamNames).some((tn: string) => {
              const cleanTaskTeam = (activeTask.team || '').toLowerCase().trim();
              return cleanTaskTeam.includes(tn) || tn.includes(cleanTaskTeam);
            }))
        )
      : hasLeadTeams // When creating, Team Lead is only allowed if they actually lead a team
  );

  const isTaskLocked = Boolean(activeTask?.isLocked);
  const lockedByIdStr = (activeTask?.lockedBy?._id || activeTask?.lockedBy)?.toString();
  const isLockedByMe = Boolean(lockedByIdStr && currentUserIdStr && lockedByIdStr === currentUserIdStr);
  const canUnlock = isLevel1 || isLockedByMe;
  const canLock = !isGuest && (isLevel1 || isLevel2 || isTeamLeadAllowed);

  const canEditFullFields = !isGuest && !isMember && (isLevel1 || isLevel2 || isTeamLeadAllowed);
  const canAssignOthers = canEditFullFields;
  const canChangeStatus = !isGuest && (canEditFullFields || (isLevel4 && isTaskAssignee));
  const canComment = !isGuest && (canEditFullFields || (isLevel4 && isTaskAssignee));
  const canDeleteTask = !isTaskLocked && !isGuest && (isLevel1 || isLevel2 || isTeamLeadAllowed || isTaskReporter);
  const canManageSubtasks = !isGuest && (canEditFullFields || isTaskAssignee);
  const canSave = isEditing ? canChangeStatus : (canEditFullFields && (!isLevel3 || isLevel1 || isLevel2 || hasLeadTeams));

  // Create Task Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/tasks', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['for-you-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints'] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress'] });
      queryClient.invalidateQueries({ queryKey: ['project-teams'] });
      onClose();
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error || 'Failed to create task. Please check fields.');
    }
  });

  // Update Task Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put(`/tasks/${activeTask._id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['for-you-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints'] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress'] });
      queryClient.invalidateQueries({ queryKey: ['project-teams'] });
      refetchTask();
      refetchActivities();
      onClose();
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error || 'Failed to update task. Please check fields.');
    }
  });

  // Soft Delete Task Mutation (30-day Recycle Bin)
  const deleteTaskMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/tasks/${activeTask._id}`);
      return res.data;
    },
    onSuccess: () => {
      broadcastSyncEvent('TASK_DELETED', { taskId: activeTask._id, projectId: activeTask.projectId });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['for-you-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints'] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      queryClient.invalidateQueries({ queryKey: ['project-teams-progress'] });
      queryClient.invalidateQueries({ queryKey: ['project-teams'] });
      setIsDeleteModalOpen(false);
      onClose();
    },
    onError: (err: any) => {
      setFormError(err?.response?.data?.error || 'Failed to move task to Recycle Bin.');
      setIsDeleteModalOpen(false);
    }
  });

  // Add Subtask Mutation with full fields
  const addSubtaskMutation = useMutation({
    mutationFn: async ({
      title,
      description,
      startDate,
      dueDate,
      status,
      assigneeId
    }: {
      title: string;
      description?: string;
      startDate?: string;
      dueDate?: string;
      status?: string;
      assigneeId?: string;
    }) => {
      const res = await api.post(`/tasks/${activeTask._id}/subtasks`, {
        title,
        description: description || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        status: status || undefined,
        assigneeId: assigneeId || undefined
      });
      return res.data;
    },
    onSuccess: (data) => {
      setNewSubtaskTitle('');
      setNewSubtaskDescription('');
      setNewSubtaskStartDate('');
      setNewSubtaskDueDate('');
      setNewSubtaskStatus('');
      setNewSubtaskAssigneeId('');
      setIsAddSubtaskDetailsOpen(false);
      setAssigneeId('');
      if (data?.data?.taskStatus) {
        setStatus(data.data.taskStatus);
      }
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  // Toggle or Update Subtask Mutation (Title, Description, Dates, Status, Assignee, Completion)
  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      title,
      description,
      startDate,
      dueDate,
      status,
      isCompleted,
      assigneeId
    }: {
      subtaskId: string;
      title?: string;
      description?: string;
      startDate?: string | null;
      dueDate?: string | null;
      status?: string;
      isCompleted?: boolean;
      assigneeId?: string | null;
    }) => {
      const payload: any = {};
      if (title !== undefined) payload.title = title;
      if (description !== undefined) payload.description = description;
      if (startDate !== undefined) payload.startDate = startDate;
      if (dueDate !== undefined) payload.dueDate = dueDate;
      if (status !== undefined) payload.status = status;
      if (isCompleted !== undefined) payload.isCompleted = isCompleted;
      if (assigneeId !== undefined) payload.assigneeId = assigneeId || null;
      const res = await api.patch(`/tasks/${activeTask._id}/subtasks/${subtaskId}`, payload);
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      setExpandedSubtaskId(null);
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  // Delete Subtask Mutation
  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      const res = await api.delete(`/tasks/${activeTask._id}/subtasks/${subtaskId}`);
      return res.data;
    },
    onSuccess: () => {
      refetchTask();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to delete subtask');
    }
  });

  // Mini-task Mutations
  const addMinitaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      title,
      description,
      startDate,
      dueDate,
      status,
      assigneeId
    }: {
      subtaskId: string;
      title: string;
      description?: string;
      startDate?: string;
      dueDate?: string;
      status?: string;
      assigneeId?: string;
    }) => {
      const res = await api.post(`/tasks/${activeTask._id}/subtasks/${subtaskId}/minitasks`, {
        title,
        description: description || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
        status: status || undefined,
        assigneeId: assigneeId || undefined
      });
      return res.data;
    },
    onSuccess: (data, variables) => {
      setNewMinitaskTitles((prev) => ({ ...prev, [variables.subtaskId]: '' }));
      setNewMinitaskAssignees((prev) => ({ ...prev, [variables.subtaskId]: '' }));
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  const toggleMinitaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      minitaskId,
      title,
      description,
      startDate,
      dueDate,
      status,
      isCompleted,
      assigneeId
    }: {
      subtaskId: string;
      minitaskId: string;
      title?: string;
      description?: string;
      startDate?: string | null;
      dueDate?: string | null;
      status?: string;
      isCompleted?: boolean;
      assigneeId?: string | null;
    }) => {
      const payload: any = {};
      if (title !== undefined) payload.title = title;
      if (description !== undefined) payload.description = description;
      if (startDate !== undefined) payload.startDate = startDate;
      if (dueDate !== undefined) payload.dueDate = dueDate;
      if (status !== undefined) payload.status = status;
      if (isCompleted !== undefined) payload.isCompleted = isCompleted;
      if (assigneeId !== undefined) payload.assigneeId = assigneeId || null;
      const res = await api.patch(
        `/tasks/${activeTask._id}/subtasks/${subtaskId}/minitasks/${minitaskId}`,
        payload
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  const deleteMinitaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      minitaskId
    }: {
      subtaskId: string;
      minitaskId: string;
    }) => {
      const res = await api.delete(
        `/tasks/${activeTask._id}/subtasks/${subtaskId}/minitasks/${minitaskId}`
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      refetchTask();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to delete mini-task');
    }
  });

  const addMicrotaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      minitaskId,
      title,
      description,
      startDate,
      dueDate,
      status,
      assigneeId
    }: {
      subtaskId: string;
      minitaskId: string;
      title: string;
      description?: string;
      startDate?: string | null;
      dueDate?: string | null;
      status?: string;
      assigneeId?: string | null;
    }) => {
      const res = await api.post(
        `/tasks/${activeTask._id}/subtasks/${subtaskId}/minitasks/${minitaskId}/microtasks`,
        {
          title,
          description: description || undefined,
          startDate: startDate || undefined,
          dueDate: dueDate || undefined,
          status: status || undefined,
          assigneeId: assigneeId || undefined
        }
      );
      return res.data;
    },
    onSuccess: (data, variables) => {
      setNewMicrotaskTitles((prev) => ({ ...prev, [variables.minitaskId]: '' }));
      setNewMicrotaskAssignees((prev) => ({ ...prev, [variables.minitaskId]: '' }));
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  const toggleMicrotaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      minitaskId,
      microtaskId,
      title,
      description,
      startDate,
      dueDate,
      status,
      isCompleted,
      assigneeId
    }: {
      subtaskId: string;
      minitaskId: string;
      microtaskId: string;
      title?: string;
      description?: string;
      startDate?: string | null;
      dueDate?: string | null;
      status?: string;
      isCompleted?: boolean;
      assigneeId?: string | null;
    }) => {
      const payload: any = {};
      if (title !== undefined) payload.title = title;
      if (description !== undefined) payload.description = description;
      if (startDate !== undefined) payload.startDate = startDate;
      if (dueDate !== undefined) payload.dueDate = dueDate;
      if (status !== undefined) payload.status = status;
      if (isCompleted !== undefined) payload.isCompleted = isCompleted;
      if (assigneeId !== undefined) payload.assigneeId = assigneeId || null;
      const res = await api.patch(
        `/tasks/${activeTask._id}/subtasks/${subtaskId}/minitasks/${minitaskId}/microtasks/${microtaskId}`,
        payload
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  const deleteMicrotaskMutation = useMutation({
    mutationFn: async ({
      subtaskId,
      minitaskId,
      microtaskId
    }: {
      subtaskId: string;
      minitaskId: string;
      microtaskId: string;
    }) => {
      const res = await api.delete(
        `/tasks/${activeTask._id}/subtasks/${subtaskId}/minitasks/${minitaskId}/microtasks/${microtaskId}`
      );
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.taskStatus || data?.data?.taskStatus) {
        setStatus(data.taskStatus || data.data.taskStatus);
      }
      refetchTask();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to delete micro-task');
    }
  });

  // Add Comment Mutation
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await api.post(`/tasks/${activeTask._id}/comments`, { content });
      return res.data;
    },
    onSuccess: () => {
      setCommentText('');
      refetchComments();
      refetchActivities();
    }
  });

  // Log Work Mutation
  const logWorkMutation = useMutation({
    mutationFn: async ({ minutes, description }: { minutes: number; description: string }) => {
      const res = await api.post(`/tasks/${activeTask._id}/worklogs`, {
        timeSpentMinutes: minutes,
        description
      });
      return res.data;
    },
    onSuccess: () => {
      setIsLogWorkOpen(false);
      setLogDesc('');
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    }
  });

  // Toggle Watch Issue Mutation
  const toggleWatchMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/tasks/${activeTask._id}/watch`);
      return res.data;
    },
    onSuccess: () => {
      refetchTask();
    }
  });

  // Toggle Restrict Issue Mutation
  const toggleRestrictMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/tasks/${activeTask._id}/restrict`);
      return res.data;
    },
    onSuccess: () => {
      refetchTask();
      refetchActivities();
    }
  });

  // Toggle Task / Subtask / Mini / Micro Lock Mutation (Prevents deletion, only locker or admin can unlock)
  const toggleLockMutation = useMutation({
    mutationFn: async (payload?: { subtaskId?: string; minitaskId?: string; microtaskId?: string }) => {
      const res = await api.post(`/tasks/${activeTask._id}/lock`, payload || {});
      return res.data;
    },
    onSuccess: (data: any) => {
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['for-you-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints'] });
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to toggle lock');
    }
  });

  // Upload Attachment Mutation
  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/tasks/${activeTask._id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: () => {
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || err.message || 'Failed to upload attachment');
    }
  });

  // Delete Attachment Mutation
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await api.delete(`/tasks/${activeTask._id}/attachments/${attachmentId}`);
      return res.data;
    },
    onSuccess: () => {
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || err.message || 'Failed to delete attachment');
    }
  });

  // Fetch all linkable tasks in project
  const { data: linkableTasks = [] } = useQuery({
    queryKey: ['linkable-tasks', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const res = await api.get(`/tasks?projectId=${activeProjectId}`);
      return res.data.data;
    },
    enabled: isOpen && isEditing && isLinkingOpen && !!activeProjectId
  });

  // Link Task Mutation
  const linkTaskMutation = useMutation({
    mutationFn: async ({ targetTaskId, type }: { targetTaskId: string; type: string }) => {
      const res = await api.post(`/tasks/${activeTask._id}/links`, { targetTaskId, type });
      return res.data;
    },
    onSuccess: () => {
      setIsLinkingOpen(false);
      setTargetTaskId('');
      refetchTask();
      refetchActivities();
      queryClient.invalidateQueries({ queryKey: ['dependency-graph'] });
    }
  });

  // Unlink Task Mutation
  const unlinkTaskMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await api.delete(`/tasks/${activeTask._id}/links/${linkId}`);
      return res.data;
    },
    onSuccess: () => {
      refetchTask();
      queryClient.invalidateQueries({ queryKey: ['dependency-graph'] });
    }
  });

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0 || !activeTask?._id) return;
    Array.from(files).forEach((file) => {
      if (file.size > 200 * 1024) {
        alert(`File "${file.name}" exceeds the 200 KB limit (${(file.size / 1024).toFixed(1)} KB). Please choose a file up to 200 KB.`);
        return;
      }
      uploadAttachmentMutation.mutate(file);
    });
  };


  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;
    if (!labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
    }
    setCustomTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setLabels(labels.filter((l) => l !== tagToRemove));
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard?.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (!isOpen || !isMounted) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    if (!activeProjectId) {
      setFormError('Please select a project before creating a task.');
      return;
    }

    if (!title.trim()) {
      setFormError('Please enter a task summary/title.');
      return;
    }

    // Team Lead restriction: Must create task for assigned team only
    if (isLevel3 && !isLevel1 && !isLevel2) {
      if (myLeadTeams.length === 0) {
        setFormError('You cannot create tasks because you are not assigned as Team Lead for any team in this project.');
        return;
      }
      const isAllowedTeam = myLeadTeams.some(
        (t: any) => t.name?.toLowerCase().trim() === (team || '').toLowerCase().trim()
      );
      if (!team || !isAllowedTeam) {
        setFormError(`Team Leads can only create tasks for their own assigned team (${myLeadTeams.map((t: any) => t.name).join(', ')})`);
        return;
      }
    }

    // Find selected sprint name if any
    const selectedSprintObj = sprintsData?.find((s: any) => s._id === sprintId);
    const sprintName = selectedSprintObj ? selectedSprintObj.name : 'Sprint 1';

    // Safe ObjectId checks
    const safeAssigneeId = assigneeId && assigneeId.length === 24 ? assigneeId : null;
    const safeSprintId = sprintId && sprintId.length === 24 ? sprintId : null;

    // Ensure parent dates envelope all draft subtasks
    let finalStartDate = startDate;
    let finalDueDate = dueDate;
    if (draftSubtasks.length > 0) {
      const { minStart, maxDue } = syncDatesFromSubtasks(draftSubtasks);
      if (minStart && (!finalStartDate || minStart < finalStartDate)) {
        finalStartDate = minStart;
      }
      if (maxDue && (!finalDueDate || maxDue > finalDueDate)) {
        finalDueDate = maxDue;
      }
    }

    const payload = {
      projectId: activeProjectId,
      title: title.trim(),
      description,
      issueType,
      priority,
      status,
      assigneeId: safeAssigneeId,
      sprintId: safeSprintId,
      sprint: sprintName,
      labels,
      team,
      epic,
      dueDate: finalDueDate || null,
      startDate: finalStartDate || null
    };

    if (isEditing) {
      if (!canEditFullFields) {
        updateMutation.mutate({ status });
      } else {
        updateMutation.mutate(payload);
      }
    } else {
      if (draftSubtasks.length > 0) {
        (payload as any).subtasks = draftSubtasks.map((st) => ({
          title: st.title,
          description: st.description || '',
          startDate: st.startDate || null,
          dueDate: st.dueDate || null,
          status: st.status || undefined,
          assigneeId: st.assigneeId || undefined,
          microtasks: st.microtasks || []
        }));
      }
      createMutation.mutate(payload);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BUG':
        return <Bug className="w-4 h-4 text-rose-500" />;
      case 'EPIC':
        return <Layers className="w-4 h-4 text-purple-500" />;
      default:
        return <CheckSquare className="w-4 h-4 text-blue-500" />;
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return '';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)} seconds ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const subtasks = activeTask?.subtasks || [];
  const completedSubtasksCount = subtasks.filter((s: any) => s.isCompleted).length;
  const workLogs = activeTask?.workLogs || [];
  const totalWorkMinutes = activeTask?.timeSpent || workLogs.reduce((acc: number, curr: any) => acc + (curr.timeSpentMinutes || 0), 0);



  const isUserWatching = activeTask?.watchers?.some(
    (w: any) => (w?._id || w)?.toString() === currentUserIdStr
  ) || false;

  const isRestricted = activeTask?.isRestricted || false;
  const watchersCount = activeTask?.watchers?.length ?? (isUserWatching ? 1 : 0);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-fade-in">
      <div
        className={`bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-[#111827] transition-all duration-200 my-auto ${
          isFullscreen ? 'w-full h-full max-w-none rounded-none' : 'w-full max-w-5xl max-h-[92vh]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between bg-[#F3F4F6]/80 select-none">
          {/* Left: Task Key Badge & Current Active User Session */}
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-gray-200 font-mono font-bold text-[#111827] shadow-2xs">
              {getTypeIcon(issueType)}
              <span>{isEditing ? activeTask.key : `NEW MAIN TASK • ${currentProject?.key || 'TASK'}-MT`}</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-gray-200 text-xs shadow-2xs font-medium" title="Current Active Session">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[#111827] font-bold">{user?.name || 'User'}</span>
              <span className="text-[10px] font-semibold text-slate-500 uppercase px-1.5 py-0.2 bg-slate-100 rounded border border-slate-200">
                {user?.role ? user.role.replace(/_/g, ' ') : 'MEMBER'}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Task Lock (Deletion Protection) Toggle - "who locked that person only can remove that lock" */}
            {isEditing && (
              <button
                type="button"
                disabled={toggleLockMutation.isPending || (isTaskLocked && !canUnlock)}
                onClick={() => {
                  if (isTaskLocked && !canUnlock) {
                    alert(`Only ${activeTask?.lockedBy?.name || 'the user who locked this task'} can remove the lock.`);
                    return;
                  }
                  toggleLockMutation.mutate();
                }}
                title={
                  isTaskLocked
                    ? `Locked by ${activeTask?.lockedBy?.name || 'Lead/Admin'}. Deletion is blocked. ${
                        canUnlock ? 'Click to unlock.' : `Only ${activeTask?.lockedBy?.name || 'the locker'} can unlock.`
                      }`
                    : canLock
                    ? 'Lock task to prevent deletion'
                    : 'Only Team Leads and Admins can lock tasks'
                }
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                  isTaskLocked
                    ? 'bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs hover:bg-rose-200'
                    : 'text-gray-500 hover:text-[#111827] hover:bg-white border border-gray-200'
                }`}
              >
                {isTaskLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-rose-700" />
                    <span className="text-[11px] font-bold text-rose-800">LOCKED</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[11px] font-medium text-gray-600 hidden sm:inline">Lock</span>
                  </>
                )}
              </button>
            )}

            {/* Visibility Restriction Toggle */}
            <button
              type="button"
              disabled={!isEditing || toggleRestrictMutation.isPending}
              onClick={() => toggleRestrictMutation.mutate()}
              title={
                isRestricted
                  ? 'Restricted: Visible to project members only (Click to make public)'
                  : 'Public: Visible to entire workspace (Click to restrict)'
              }
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                isRestricted
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs hover:bg-amber-200'
                  : 'text-gray-400 hover:text-[#111827] hover:bg-white border border-transparent'
              }`}
            >
              <Eye className="w-4 h-4 text-gray-500" />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="p-1.5 text-gray-500 hover:text-[#111827] hover:bg-white rounded-lg transition-colors cursor-pointer hidden sm:block"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {isEditing && isTaskLocked && (
              <div
                title={`This task is locked by ${activeTask?.lockedBy?.name || 'Lead/Admin'} and cannot be deleted.`}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed select-none"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Deletion Blocked</span>
              </div>
            )}

            {isEditing && !isTaskLocked && canDeleteTask && (
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(true)}
                title="Move to Recycle Bin (30-day retention)"
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden sm:inline">Delete Task</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Task Locked Warning Banner */}
        {isTaskLocked && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs font-semibold text-rose-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Task Locked:</strong> Locked by {activeTask?.lockedBy?.name || 'a Team Lead/Admin'}
                {activeTask?.lockedAt ? ` on ${new Date(activeTask.lockedAt).toLocaleDateString()}` : ''}.
                {' '}Deletion of this task and all its child tasks is completely blocked.
                {' '}<strong>Only {activeTask?.lockedBy?.name || 'the person who locked it'} can unlock it.</strong>
              </span>
            </div>
            {canUnlock && (
              <button
                type="button"
                onClick={() => toggleLockMutation.mutate()}
                disabled={toggleLockMutation.isPending}
                className="px-2.5 py-1 bg-white hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-md text-[11px] font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                Unlock Task
              </button>
            )}
          </div>
        )}

        {/* Modal Error Banner */}
        {formError && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between animate-shake">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
            <button onClick={() => setFormError(null)} className="text-rose-500 hover:text-rose-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Permission Info Banners */}
        {isGuest && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs font-semibold text-amber-800 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Read-Only View: Guests have view-only access across the workspace.</span>
          </div>
        )}
        {!isGuest && isLevel4 && isEditing && !isTaskAssignee && (
          <div className="bg-slate-100 border-b border-slate-200 px-6 py-2 text-xs font-semibold text-slate-700 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>View-Only: This task is assigned to another team member. Members can only update the stage and comment on their own tasks.</span>
          </div>
        )}
        {!isGuest && isLevel4 && isEditing && isTaskAssignee && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-xs font-semibold text-blue-800 flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Member Mode: You can change the status (stage) and add comments to your assigned task.</span>
          </div>
        )}
        {!isGuest && isLevel3 && isEditing && !isTeamLeadAllowed && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs font-semibold text-amber-800 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>View-Only: This task belongs to another team. Team Leads can only manage tasks for their own assigned team.</span>
          </div>
        )}
        {!isEditing && isLevel3 && !isLevel1 && !isLevel2 && !hasLeadTeams && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2.5 text-xs font-semibold text-rose-800 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Permission Denied: You are registered as Team Lead, but you are not assigned as the Leader of any team in this project. Team Leads can only create tasks for their own assigned team.</span>
          </div>
        )}
        {!isEditing && (isGuest || isLevel4) && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 text-xs font-semibold text-rose-800 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Permission Denied: Only Team Leads, Project Managers, and Org Admins can create tasks.</span>
          </div>
        )}

        {/* Modal Dual-Column Body */}
        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
          {/* Left Main Content Pane */}
          <div className="flex-1 p-6 sm:p-8 flex flex-col gap-6">
            {/* Title / Summary */}
            <div>
              <input
                type="text"
                required
                disabled={!canEditFullFields}
                placeholder="Task summary / title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full text-lg sm:text-xl font-bold text-[#111827] placeholder-gray-400 border-none outline-none focus:ring-0 px-0 py-1 bg-transparent hover:bg-gray-50/50 rounded-lg transition-colors ${
                  !canEditFullFields ? 'cursor-not-allowed opacity-80' : ''
                }`}
              />
            </div>

            {/* Description Section */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">Description</label>
              <textarea
                rows={4}
                disabled={!canEditFullFields}
                placeholder="Add a description... (supports Markdown, acceptance criteria, technical notes)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full px-4 py-3 text-xs sm:text-sm text-[#111827] bg-[#F3F4F6]/50 hover:bg-[#F3F4F6] focus:bg-white border border-gray-200 rounded-xl outline-none focus:border-[#0F172A] transition-all resize-y ${
                  !canEditFullFields ? 'cursor-not-allowed opacity-80' : ''
                }`}
              />
            </div>

            {/* Subtasks Section */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase">
                    Subtasks {isEditing ? '' : '(Optional - Add to this Main Task)'}
                  </label>
                  {isEditing ? (
                    subtasks.length > 0 && (
                      <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {completedSubtasksCount} / {subtasks.length}
                      </span>
                    )
                  ) : (
                    draftSubtasks.length > 0 && (
                      <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                        {draftSubtasks.length} subtask{draftSubtasks.length > 1 ? 's' : ''} queued
                      </span>
                    )
                  )}
                </div>
                {isEditing && subtasks.length > 0 && completedSubtasksCount === subtasks.length && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    All Subtasks Done (Main Task Auto-Completed)
                  </span>
                )}
              </div>

              {/* Subtask Progress Bar */}
              {subtasks.length > 0 && (
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[#22C55E] h-full transition-all duration-300"
                    style={{ width: `${(completedSubtasksCount / subtasks.length) * 100}%` }}
                  />
                </div>
              )}

              {/* Subtasks List */}
              <div className="flex flex-col gap-2">
                {subtasks.map((sub: any) => {
                  const subAssignee = sub.assigneeId;
                  const isSubAssignee = subAssignee && (subAssignee._id || subAssignee).toString() === currentUserIdStr;
                  const canToggleThisSubtask = canEditFullFields || isTaskAssignee || isSubAssignee;
                  const isExpanded = expandedSubtaskId === sub._id;
                  const isHighlighted =
                    highlightedItemId === sub._id ||
                    (sub.key && highlightedItemId === sub.key);

                  return (
                    <div
                      key={sub._id}
                      id={`subtask-${sub._id}`}
                      data-subtask-key={sub.key}
                      className={`rounded-xl bg-white border shadow-2xs transition-all overflow-hidden group ${
                        isHighlighted
                          ? 'ring-4 ring-indigo-500/90 border-indigo-500 bg-indigo-50/50 shadow-lg animate-pulse'
                          : 'border-gray-200/90'
                      }`}
                    >
                      {/* Subtask Header Row */}
                      <div className="flex items-center justify-between p-2.5 bg-gray-50/70 hover:bg-gray-100/60 transition-colors gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                          {sub.key && (
                            <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0">
                              {sub.key}
                            </span>
                          )}
                          <span
                            onClick={() => {
                              if (canToggleThisSubtask) {
                                if (isExpanded) {
                                  setExpandedSubtaskId(null);
                                } else {
                                  setExpandedSubtaskId(sub._id);
                                  setSubtaskEditForm({
                                    title: sub.title || '',
                                    description: sub.description || '',
                                    startDate: sub.startDate ? new Date(sub.startDate).toISOString().slice(0, 10) : '',
                                    dueDate: sub.dueDate ? new Date(sub.dueDate).toISOString().slice(0, 10) : '',
                                    status: sub.status || '',
                                    assigneeId: subAssignee?._id || subAssignee || ''
                                  });
                                }
                              }
                            }}
                            className={`text-xs font-semibold text-[#111827] truncate ${
                              canToggleThisSubtask ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''
                            }`}
                            title={canToggleThisSubtask ? 'Click to edit subtask details' : undefined}
                          >
                            {sub.title}
                          </span>
                        </div>

                        {/* Stage Selector */}
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            disabled={!canToggleThisSubtask || toggleSubtaskMutation.isPending}
                            value={sub.status || ''}
                            onChange={(e) =>
                              toggleSubtaskMutation.mutate({
                                subtaskId: sub._id,
                                status: e.target.value
                              })
                            }
                            className="text-[11px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-700 hover:border-gray-300 cursor-pointer shadow-2xs"
                          >
                            {workflowStages.map((st: any) => (
                              <option key={st.id} value={st.id}>
                                {st.label}
                              </option>
                            ))}
                          </select>

                          {/* Quick Interactive Date Badge / Popover */}
                          <div className="relative">
                            <button
                              type="button"
                              disabled={!canToggleThisSubtask}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeDatePopoverId === sub._id) {
                                  setActiveDatePopoverId(null);
                                } else {
                                  setActiveDatePopoverId(sub._id);
                                  setDatePopoverStart(sub.startDate ? new Date(sub.startDate).toISOString().slice(0, 10) : '');
                                  setDatePopoverDue(sub.dueDate ? new Date(sub.dueDate).toISOString().slice(0, 10) : '');
                                }
                              }}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer border ${
                                sub.startDate || sub.dueDate
                                  ? 'text-gray-700 bg-white hover:bg-blue-50/70 border-gray-200 hover:border-blue-300'
                                  : 'text-gray-400 bg-white hover:bg-blue-50/70 border-dashed border-gray-300 hover:border-blue-300 hover:text-blue-600'
                              }`}
                              title="Click to edit subtask start & stop dates"
                            >
                              <Calendar className={`w-3 h-3 ${sub.startDate || sub.dueDate ? 'text-blue-500' : 'text-gray-400'}`} />
                              <span>
                                {sub.startDate || sub.dueDate ? (
                                  <>
                                    {sub.startDate ? new Date(sub.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Start'}
                                    {' - '}
                                    {sub.dueDate ? new Date(sub.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Stop'}
                                  </>
                                ) : (
                                  '+ Dates'
                                )}
                              </span>
                            </button>

                            {/* Floating Quick Date Editor Popover */}
                            {activeDatePopoverId === sub._id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1.5 z-50 p-3 bg-white border border-gray-200 rounded-2xl shadow-xl w-64 flex flex-col gap-2.5 animate-scale-in"
                              >
                                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                                  <span className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Edit Subtask Dates</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveDatePopoverId(null)}
                                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Start Date</label>
                                    <input
                                      type="date"
                                      value={datePopoverStart}
                                      onChange={(e) => setDatePopoverStart(e.target.value)}
                                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-500 bg-gray-50/50"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Stop (Due) Date</label>
                                    <input
                                      type="date"
                                      value={datePopoverDue}
                                      onChange={(e) => setDatePopoverDue(e.target.value)}
                                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-500 bg-gray-50/50"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDatePopoverStart('');
                                      setDatePopoverDue('');
                                      toggleSubtaskMutation.mutate({
                                        subtaskId: sub._id,
                                        startDate: null,
                                        dueDate: null
                                      });
                                      setActiveDatePopoverId(null);
                                    }}
                                    className="text-[10px] font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                                  >
                                    Clear
                                  </button>

                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setActiveDatePopoverId(null)}
                                      className="px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={toggleSubtaskMutation.isPending}
                                      onClick={() => {
                                        toggleSubtaskMutation.mutate({
                                          subtaskId: sub._id,
                                          startDate: datePopoverStart || null,
                                          dueDate: datePopoverDue || null
                                        });
                                        if (datePopoverStart && (!startDate || datePopoverStart < startDate)) {
                                          setStartDate(datePopoverStart);
                                        }
                                        if (datePopoverDue && (!dueDate || datePopoverDue > dueDate)) {
                                          setDueDate(datePopoverDue);
                                        }
                                        setActiveDatePopoverId(null);
                                      }}
                                      className="px-2.5 py-1 text-[11px] font-bold bg-[#0F172A] text-white hover:bg-[#1E293B] rounded-lg cursor-pointer"
                                    >
                                      Save Dates
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Member Assignee Selector */}
                          {canAssignOthers ? (
                            <select
                              value={subAssignee?._id || subAssignee || ''}
                              onChange={(e) =>
                                toggleSubtaskMutation.mutate({
                                  subtaskId: sub._id,
                                  assigneeId: e.target.value
                                })
                              }
                              className="text-[11px] font-medium bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none text-gray-700 hover:border-gray-300 cursor-pointer shadow-2xs max-w-[120px] truncate"
                              title="Subtask Assignee"
                            >
                              <option value="">Unassigned</option>
                              {assignableMembers.map((m: any) => {
                                const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                return (
                                  <option key={mId} value={mId}>
                                    {mName}
                                  </option>
                                );
                              })}
                            </select>
                          ) : (
                            subAssignee ? (
                              <span className="text-[11px] font-semibold text-gray-600 bg-white border border-gray-200 px-2 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                <User className="w-3 h-3 text-gray-400" />
                                {subAssignee.name || 'Assigned'}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic px-2 py-1">
                                Unassigned
                              </span>
                            )
                          )}

                          {/* Edit Details Toggle */}
                          {canToggleThisSubtask && (
                            <button
                              type="button"
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedSubtaskId(null);
                                } else {
                                  setExpandedSubtaskId(sub._id);
                                  setSubtaskEditForm({
                                    title: sub.title || '',
                                    description: sub.description || '',
                                    startDate: sub.startDate ? new Date(sub.startDate).toISOString().slice(0, 10) : '',
                                    dueDate: sub.dueDate ? new Date(sub.dueDate).toISOString().slice(0, 10) : '',
                                    status: sub.status || '',
                                    assigneeId: subAssignee?._id || subAssignee || ''
                                  });
                                }
                              }}
                              className={`p-1 rounded-lg transition-all cursor-pointer ${
                                isExpanded ? 'text-indigo-600 bg-indigo-50 border border-indigo-200' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'
                              }`}
                              title="Edit Details (Description & Dates)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Subtask Lock Toggle */}
                          {isEditing && (
                            <button
                              type="button"
                              disabled={toggleLockMutation.isPending || (sub.isLocked && !(isLevel1 || ((sub.lockedBy?._id || sub.lockedBy)?.toString() === currentUserIdStr)))}
                              onClick={() => {
                                const isLockedByMe = (sub.lockedBy?._id || sub.lockedBy)?.toString() === currentUserIdStr;
                                if (sub.isLocked && !isLevel1 && !isLockedByMe) {
                                  alert(`Only ${sub.lockedBy?.name || 'the user who locked this subtask'} can remove the lock.`);
                                  return;
                                }
                                toggleLockMutation.mutate({ subtaskId: sub._id });
                              }}
                              className={`p-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                                sub.isLocked
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'text-gray-400 hover:text-amber-600 hover:bg-gray-100 border border-transparent'
                              }`}
                              title={
                                sub.isLocked
                                  ? `Subtask locked by ${sub.lockedBy?.name || 'Lead/Admin'}. Deletion is blocked. ${
                                      (isLevel1 || ((sub.lockedBy?._id || sub.lockedBy)?.toString() === currentUserIdStr))
                                        ? 'Click to unlock.'
                                        : `Only ${sub.lockedBy?.name || 'the locker'} can unlock.`
                                    }`
                                  : 'Lock subtask to prevent deletion'
                              }
                            >
                              {sub.isLocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5 text-rose-600" />
                                  <span className="text-[10px] font-bold text-rose-800 hidden sm:inline">LOCKED</span>
                                </>
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </button>
                          )}

                          {/* Delete Subtask */}
                          {canManageSubtasks && (
                            sub.isLocked ? (
                              <span
                                className="p-1 text-rose-400 cursor-not-allowed"
                                title={`Subtask locked by ${sub.lockedBy?.name || 'Lead/Admin'} - deletion is blocked`}
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => deleteSubtaskMutation.mutate(sub._id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                                title="Delete Subtask"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Subtask Description Preview if not expanded */}
                      {!isExpanded && sub.description && (
                        <div className="px-3 py-1.5 text-[11px] text-gray-500 bg-white border-t border-gray-100/80 truncate">
                          {sub.description}
                        </div>
                      )}

                      {/* Subtask Full Inline Editor (Drawer) */}
                      {isExpanded && (
                        <div className="p-3.5 bg-slate-50/90 border-t border-gray-200 flex flex-col gap-3 text-xs animate-slide-up">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span className="font-mono text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded text-[10px]">{sub.key}</span>
                              <span>Edit Subtask Details</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setExpandedSubtaskId(null)}
                              className="text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                              Title *
                            </label>
                            <input
                              type="text"
                              value={subtaskEditForm.title}
                              onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, title: e.target.value })}
                              className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl outline-none focus:border-[#0F172A] text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                              Description
                            </label>
                            <textarea
                              rows={2}
                              placeholder="Add subtask description..."
                              value={subtaskEditForm.description}
                              onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, description: e.target.value })}
                              className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-xl outline-none focus:border-[#0F172A] text-xs resize-y"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                Start Date
                              </label>
                              <input
                                type="date"
                                value={subtaskEditForm.startDate}
                                onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, startDate: e.target.value })}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                End Date (Due Date)
                              </label>
                              <input
                                type="date"
                                value={subtaskEditForm.dueDate}
                                onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, dueDate: e.target.value })}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs outline-none"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                Stage Status
                              </label>
                              <select
                                value={subtaskEditForm.status}
                                onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, status: e.target.value })}
                                className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs outline-none"
                              >
                                {workflowStages.map((st: any) => (
                                  <option key={st.id} value={st.id}>
                                    {st.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                                Assignee
                              </label>
                              {canAssignOthers ? (
                                <select
                                  value={subtaskEditForm.assigneeId}
                                  onChange={(e) => setSubtaskEditForm({ ...subtaskEditForm, assigneeId: e.target.value })}
                                  className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs outline-none"
                                >
                                  <option value="">Unassigned</option>
                                  {assignableMembers.map((m: any) => {
                                    const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                    const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                    return (
                                      <option key={mId} value={mId}>
                                        {mName}
                                      </option>
                                    );
                                  })}
                                </select>
                              ) : (
                                <div className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 font-medium">
                                  {assignableMembers.find((m: any) => {
                                    const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                    return mId === subtaskEditForm.assigneeId;
                                  })?.name || 'Unassigned (Lead-assigned only)'}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-1 border-t border-gray-200/80">
                            <button
                              type="button"
                              onClick={() => setExpandedSubtaskId(null)}
                              className="px-3 py-1 text-xs font-bold text-gray-500 hover:bg-gray-200/60 rounded-lg cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!subtaskEditForm.title.trim() || toggleSubtaskMutation.isPending}
                              onClick={() => {
                                toggleSubtaskMutation.mutate({
                                  subtaskId: sub._id,
                                  title: subtaskEditForm.title.trim(),
                                  description: subtaskEditForm.description,
                                  startDate: subtaskEditForm.startDate || null,
                                  dueDate: subtaskEditForm.dueDate || null,
                                  status: subtaskEditForm.status || undefined,
                                  assigneeId: subtaskEditForm.assigneeId || null
                                });
                                if (subtaskEditForm.startDate && (!startDate || subtaskEditForm.startDate < startDate)) {
                                  setStartDate(subtaskEditForm.startDate);
                                }
                                if (subtaskEditForm.dueDate && (!dueDate || subtaskEditForm.dueDate > dueDate)) {
                                  setDueDate(subtaskEditForm.dueDate);
                                }
                              }}
                              className="px-3.5 py-1 bg-[#0F172A] text-white rounded-xl text-xs font-bold hover:bg-[#1E293B] cursor-pointer disabled:opacity-50"
                            >
                              {toggleSubtaskMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Mini-tasks Section under this Subtask */}
                      <div className="border-t border-gray-100 bg-slate-50/50 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setIsMinitasksOpen((prev) => ({
                                ...prev,
                                [sub._id]: !prev[sub._id]
                              }))
                            }
                            className="flex items-center gap-1.5 text-[11px] font-bold text-gray-700 hover:text-teal-600 cursor-pointer"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            <span>Mini-tasks</span>
                            <span className="text-[10px] font-semibold text-gray-500 px-1.5 py-0.2 rounded-full bg-white border border-gray-200">
                              {(sub.minitasks || []).filter((m: any) => m.isCompleted || m.status === 'DONE').length}/
                              {(sub.minitasks || []).length}
                            </span>
                          </button>
                        </div>

                        {/* List of Mini-tasks */}
                        {(isMinitasksOpen[sub._id] !== false || (sub.minitasks && sub.minitasks.length > 0)) && (
                          <div className="space-y-1.5 mb-2 pl-2 border-l-2 border-teal-100">
                            {(sub.minitasks || []).map((mini: any) => {
                              const isMiniDone = mini.isCompleted || mini.status === 'DONE';
                              const isMiniHighlighted =
                                highlightedItemId === mini._id ||
                                (mini.key && highlightedItemId === mini.key);
                              const miniAssignee = mini.assigneeId;
                              const miniAssigneeId = (typeof miniAssignee === 'object' ? miniAssignee?._id : miniAssignee)?.toString();
                              const isMiniAssignee = miniAssigneeId && miniAssigneeId === currentUserIdStr;
                              const canManageThisMinitask = canEditFullFields || isTaskAssignee || isSubAssignee || isMiniAssignee;

                              return (
                                <div
                                  key={mini._id}
                                  id={`minitask-${mini._id}`}
                                  data-minitask-key={mini.key}
                                  className={`flex flex-col gap-1.5 p-2 rounded-lg border text-xs shadow-2xs group/mini transition-all ${
                                    isMiniHighlighted
                                      ? 'ring-4 ring-teal-500/95 border-teal-500 bg-teal-100 shadow-md animate-pulse'
                                      : 'bg-white border-gray-200/80 hover:border-teal-200'
                                  }`}
                                >
                                  {/* Mini-task Header Row */}
                                  <div className="flex items-center justify-between gap-2 w-full">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <input
                                        type="checkbox"
                                        disabled={!canManageThisMinitask}
                                        checked={isMiniDone}
                                        onChange={(e) =>
                                          toggleMinitaskMutation.mutate({
                                            subtaskId: sub._id,
                                            minitaskId: mini._id,
                                            isCompleted: e.target.checked
                                          })
                                        }
                                        className="rounded text-teal-600 focus:ring-teal-500 h-3.5 w-3.5 cursor-pointer"
                                      />
                                      {mini.key && (
                                        <span className="text-[9px] font-mono text-teal-800 bg-teal-50 px-1 py-0.2 rounded border border-teal-200 shrink-0">
                                          {mini.key}
                                        </span>
                                      )}
                                      <span
                                        className={`truncate text-xs ${
                                          isMiniDone ? 'line-through text-gray-400' : 'text-gray-800 font-medium'
                                        }`}
                                      >
                                        {mini.title}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                      {canAssignOthers ? (
                                        <select
                                          value={miniAssigneeId || ''}
                                          onChange={(e) =>
                                            toggleMinitaskMutation.mutate({
                                              subtaskId: sub._id,
                                              minitaskId: mini._id,
                                              assigneeId: e.target.value || null
                                            })
                                          }
                                          className="text-[10px] font-medium bg-white border border-gray-200 hover:border-teal-300 rounded px-1.5 py-0.5 text-gray-700 outline-none cursor-pointer max-w-[110px] truncate shadow-2xs"
                                          title="Change Mini-task Assignee"
                                        >
                                          <option value="">Unassigned</option>
                                          {assignableMembers.map((m: any) => {
                                            const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                            const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                            return (
                                              <option key={mId} value={mId}>
                                                {mName}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      ) : (
                                        miniAssignee ? (
                                          <span className="text-gray-600 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px]">
                                            <User className="w-2.5 h-2.5 text-gray-400" />
                                            {miniAssignee.name || 'Assigned'}
                                          </span>
                                        ) : (
                                          <span className="text-gray-400 italic text-[10px]">Unassigned</span>
                                        )
                                      )}
                                      {/* Mini-task Lock Toggle */}
                                      {isEditing && (
                                        <button
                                          type="button"
                                          disabled={toggleLockMutation.isPending || (mini.isLocked && !(isLevel1 || ((mini.lockedBy?._id || mini.lockedBy)?.toString() === currentUserIdStr)))}
                                          onClick={() => {
                                            const isLockedByMe = (mini.lockedBy?._id || mini.lockedBy)?.toString() === currentUserIdStr;
                                            if (mini.isLocked && !isLevel1 && !isLockedByMe) {
                                              alert(`Only ${mini.lockedBy?.name || 'the user who locked this mini-task'} can remove the lock.`);
                                              return;
                                            }
                                            toggleLockMutation.mutate({ subtaskId: sub._id, minitaskId: mini._id });
                                          }}
                                          className={`p-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5 ${
                                            mini.isLocked
                                              ? 'text-rose-700 bg-rose-100 border border-rose-300'
                                              : 'text-gray-400 hover:text-amber-600'
                                          }`}
                                          title={
                                            mini.isLocked
                                              ? `Mini-task locked by ${mini.lockedBy?.name || 'Lead/Admin'}. Deletion is blocked. ${
                                                  (isLevel1 || ((mini.lockedBy?._id || mini.lockedBy)?.toString() === currentUserIdStr))
                                                    ? 'Click to unlock.'
                                                    : `Only ${mini.lockedBy?.name || 'the locker'} can unlock.`
                                                }`
                                              : 'Lock mini-task to prevent deletion'
                                          }
                                        >
                                          {mini.isLocked ? (
                                            <Lock className="w-3 h-3 text-rose-600" />
                                          ) : (
                                            <Unlock className="w-3 h-3 text-gray-400" />
                                          )}
                                        </button>
                                      )}
                                      {canManageThisMinitask && (
                                        mini.isLocked ? (
                                          <span
                                            className="p-0.5 text-rose-400 cursor-not-allowed"
                                            title={`Mini-task locked by ${mini.lockedBy?.name || 'Lead/Admin'} - deletion is blocked`}
                                          >
                                            <Lock className="w-3 h-3" />
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              deleteMinitaskMutation.mutate({
                                                subtaskId: sub._id,
                                                minitaskId: mini._id
                                              })
                                            }
                                            className="opacity-0 group-hover/mini:opacity-100 p-0.5 text-gray-400 hover:text-rose-600 rounded cursor-pointer"
                                            title="Delete Mini-task"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>

                                  {/* Micro-tasks Section under this Mini-task */}
                                  <div className="w-full mt-1 pt-1.5 border-t border-teal-100/80 bg-purple-50/20 rounded-md p-1.5 flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setIsMicrotasksOpen((prev) => ({
                                            ...prev,
                                            [mini._id]: !prev[mini._id]
                                          }))
                                        }
                                        className="flex items-center gap-1.5 text-[10px] font-bold text-purple-800 hover:text-purple-950 cursor-pointer"
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                        <span>Micro-tasks</span>
                                        <span className="text-[9px] font-semibold text-gray-500 px-1.5 py-0.2 rounded-full bg-white border border-gray-200">
                                          {(mini.microtasks || []).filter((m: any) => m.isCompleted || m.status === 'DONE').length}/
                                          {(mini.microtasks || []).length}
                                        </span>
                                      </button>
                                    </div>

                                    {/* List of Micro-tasks */}
                                    {(isMicrotasksOpen[mini._id] !== false || (mini.microtasks && mini.microtasks.length > 0)) && (
                                      <div className="space-y-1 pl-2 border-l-2 border-purple-200">
                                        {(mini.microtasks || []).map((mic: any) => {
                                          const isMicDone = mic.isCompleted || mic.status === 'DONE';
                                          const isMicHighlighted =
                                            highlightedItemId === mic._id ||
                                            (mic.key && highlightedItemId === mic.key);
                                          const micAssignee = mic.assigneeId;
                                          const micAssigneeId = (typeof micAssignee === 'object' ? micAssignee?._id : micAssignee)?.toString();
                                          const isMicAssignee = micAssigneeId && micAssigneeId === currentUserIdStr;
                                          const canManageThisMicrotask = canManageThisMinitask || isMicAssignee;

                                          return (
                                            <div
                                              key={mic._id}
                                              id={`microtask-${mic._id}`}
                                              data-microtask-key={mic.key}
                                              className={`flex items-center justify-between gap-1.5 p-1 rounded border text-[11px] shadow-2xs group/mic transition-all ${
                                                isMicHighlighted
                                                  ? 'ring-4 ring-purple-600/95 border-purple-500 bg-purple-100 shadow-md animate-pulse'
                                                  : 'bg-white border-purple-100 hover:border-purple-300'
                                              }`}
                                            >
                                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                                <input
                                                  type="checkbox"
                                                  disabled={!canManageThisMicrotask}
                                                  checked={isMicDone}
                                                  onChange={(e) =>
                                                    toggleMicrotaskMutation.mutate({
                                                      subtaskId: sub._id,
                                                      minitaskId: mini._id,
                                                      microtaskId: mic._id,
                                                      isCompleted: e.target.checked
                                                    })
                                                  }
                                                  className="rounded text-purple-600 focus:ring-purple-500 h-3 w-3 cursor-pointer"
                                                />
                                                {mic.key && (
                                                  <span className="text-[8px] font-mono text-purple-800 bg-purple-50 px-1 py-0.2 rounded border border-purple-200 shrink-0">
                                                    {mic.key}
                                                  </span>
                                                )}
                                                <span
                                                  className={`truncate text-[11px] ${
                                                    isMicDone ? 'line-through text-gray-400' : 'text-gray-800 font-medium'
                                                  }`}
                                                >
                                                  {mic.title}
                                                </span>
                                              </div>

                                              <div className="flex items-center gap-1 shrink-0 text-[9px]">
                                                {canAssignOthers ? (
                                                  <select
                                                    value={micAssigneeId || ''}
                                                    onChange={(e) =>
                                                      toggleMicrotaskMutation.mutate({
                                                        subtaskId: sub._id,
                                                        minitaskId: mini._id,
                                                        microtaskId: mic._id,
                                                        assigneeId: e.target.value || null
                                                      })
                                                    }
                                                    className="text-[9px] font-medium bg-white border border-gray-200 hover:border-purple-300 rounded px-1 py-0.5 text-gray-700 outline-none cursor-pointer max-w-[95px] truncate shadow-2xs"
                                                    title="Change Micro-task Assignee"
                                                  >
                                                    <option value="">Unassigned</option>
                                                    {assignableMembers.map((m: any) => {
                                                      const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                                      const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                                      return (
                                                        <option key={mId} value={mId}>
                                                          {mName}
                                                        </option>
                                                      );
                                                    })}
                                                  </select>
                                                ) : (
                                                  micAssignee && (
                                                    <span className="text-gray-500 bg-gray-50 border border-gray-200 px-1 py-0.5 rounded flex items-center gap-1 text-[9px]">
                                                      <User className="w-2 h-2 text-gray-400" />
                                                      {micAssignee.name || 'Assigned'}
                                                    </span>
                                                  )
                                                )}
                                                {/* Micro-task Lock Toggle */}
                                                {isEditing && (
                                                  <button
                                                    type="button"
                                                    disabled={toggleLockMutation.isPending || (mic.isLocked && !(isLevel1 || ((mic.lockedBy?._id || mic.lockedBy)?.toString() === currentUserIdStr)))}
                                                    onClick={() => {
                                                      const isLockedByMe = (mic.lockedBy?._id || mic.lockedBy)?.toString() === currentUserIdStr;
                                                      if (mic.isLocked && !isLevel1 && !isLockedByMe) {
                                                        alert(`Only ${mic.lockedBy?.name || 'the user who locked this micro-task'} can remove the lock.`);
                                                        return;
                                                      }
                                                      toggleLockMutation.mutate({ subtaskId: sub._id, minitaskId: mini._id, microtaskId: mic._id });
                                                    }}
                                                    className={`p-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5 ${
                                                      mic.isLocked
                                                        ? 'text-rose-700 bg-rose-100 border border-rose-300'
                                                        : 'text-gray-400 hover:text-emerald-600'
                                                    }`}
                                                    title={
                                                      mic.isLocked
                                                        ? `Micro-task locked by ${mic.lockedBy?.name || 'Lead/Admin'}. Deletion is blocked. ${
                                                            (isLevel1 || ((mic.lockedBy?._id || mic.lockedBy)?.toString() === currentUserIdStr))
                                                              ? 'Click to unlock.'
                                                              : `Only ${mic.lockedBy?.name || 'the locker'} can unlock.`
                                                          }`
                                                        : 'Lock micro-task to prevent deletion'
                                                    }
                                                  >
                                                    {mic.isLocked ? (
                                                      <Lock className="w-2.5 h-2.5 text-rose-600" />
                                                    ) : (
                                                      <Unlock className="w-2.5 h-2.5 text-gray-400" />
                                                    )}
                                                  </button>
                                                )}
                                                {canManageThisMicrotask && (
                                                  mic.isLocked ? (
                                                    <span
                                                      className="p-0.5 text-rose-400 cursor-not-allowed"
                                                      title={`Micro-task locked by ${mic.lockedBy?.name || 'Lead/Admin'} - deletion is blocked`}
                                                    >
                                                      <Lock className="w-2.5 h-2.5" />
                                                    </span>
                                                  ) : (
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        deleteMicrotaskMutation.mutate({
                                                          subtaskId: sub._id,
                                                          minitaskId: mini._id,
                                                          microtaskId: mic._id
                                                        })
                                                      }
                                                      className="opacity-0 group-hover/mic:opacity-100 p-0.5 text-gray-400 hover:text-rose-600 rounded cursor-pointer"
                                                      title="Delete Micro-task"
                                                    >
                                                      <Trash2 className="w-2.5 h-2.5" />
                                                    </button>
                                                  )
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Inline Add Micro-task Form (under this Mini-task) */}
                                    {canManageThisMinitask && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <input
                                          type="text"
                                          placeholder="+ Add micro-task..."
                                          value={newMicrotaskTitles[mini._id] || ''}
                                          onChange={(e) =>
                                            setNewMicrotaskTitles((prev) => ({
                                              ...prev,
                                              [mini._id]: e.target.value
                                            }))
                                          }
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              const title = (newMicrotaskTitles[mini._id] || '').trim();
                                              if (!title) return;
                                              addMicrotaskMutation.mutate({
                                                subtaskId: sub._id,
                                                minitaskId: mini._id,
                                                title,
                                                assigneeId: canAssignOthers ? (newMicrotaskAssignees[mini._id] || undefined) : (currentUserIdStr || undefined)
                                              });
                                            }
                                          }}
                                          className="flex-1 px-2 py-0.5 text-[11px] bg-white border border-gray-200 rounded-md outline-none focus:border-purple-500"
                                        />
                                        {canAssignOthers ? (
                                          <select
                                            value={newMicrotaskAssignees[mini._id] || ''}
                                            onChange={(e) =>
                                              setNewMicrotaskAssignees((prev) => ({
                                                ...prev,
                                                [mini._id]: e.target.value
                                              }))
                                            }
                                            className="text-[9px] bg-white border border-gray-200 rounded-md px-1 py-0.5 text-gray-600 outline-none max-w-[95px] cursor-pointer truncate"
                                          >
                                            <option value="">Assignee</option>
                                            {assignableMembers.map((m: any) => {
                                              const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                              const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                              return (
                                                <option key={mId} value={mId}>
                                                  {mName}
                                                </option>
                                              );
                                            })}
                                          </select>
                                        ) : (
                                          <span className="text-[9px] font-semibold text-purple-800 bg-purple-50 border border-purple-200 rounded-md px-1.5 py-0.5 shrink-0 flex items-center gap-1">
                                            <User className="w-2.5 h-2.5" />
                                            <span>{user?.name || (user?.email ? user.email.split('@')[0] : 'Me')}</span>
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          disabled={!(newMicrotaskTitles[mini._id] || '').trim() || addMicrotaskMutation.isPending}
                                          onClick={() => {
                                            const title = (newMicrotaskTitles[mini._id] || '').trim();
                                            if (!title) return;
                                            addMicrotaskMutation.mutate({
                                              subtaskId: sub._id,
                                              minitaskId: mini._id,
                                              title,
                                              assigneeId: canAssignOthers ? (newMicrotaskAssignees[mini._id] || undefined) : (currentUserIdStr || undefined)
                                            });
                                          }}
                                          className="px-2 py-0.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-[10px] font-bold cursor-pointer disabled:opacity-40"
                                        >
                                          + Add
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Inline Add Mini-task Form (under this Subtask) */}
                        {canToggleThisSubtask && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="text"
                              placeholder="+ Add mini-task..."
                              value={newMinitaskTitles[sub._id] || ''}
                              onChange={(e) =>
                                setNewMinitaskTitles((prev) => ({
                                  ...prev,
                                  [sub._id]: e.target.value
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const title = (newMinitaskTitles[sub._id] || '').trim();
                                  if (!title) return;
                                  addMinitaskMutation.mutate({
                                    subtaskId: sub._id,
                                    title,
                                    assigneeId: canAssignOthers ? (newMinitaskAssignees[sub._id] || undefined) : (currentUserIdStr || undefined)
                                  });
                                }
                              }}
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-teal-500"
                            />
                            {canAssignOthers ? (
                              <select
                                value={newMinitaskAssignees[sub._id] || ''}
                                onChange={(e) =>
                                  setNewMinitaskAssignees((prev) => ({
                                    ...prev,
                                    [sub._id]: e.target.value
                                  }))
                                }
                                className="text-[10px] bg-white border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 outline-none max-w-[100px] truncate"
                              >
                                <option value="">Assignee</option>
                                {assignableMembers.map((m: any) => {
                                  const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                  const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                  return (
                                    <option key={mId} value={mId}>
                                      {mName}
                                    </option>
                                  );
                                })}
                              </select>
                            ) : (
                              <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2 py-1 shrink-0 flex items-center gap-1" title="Assigned to you">
                                <User className="w-2.5 h-2.5" />
                                <span>{user?.name || (user?.email ? user.email.split('@')[0] : 'Me')}</span>
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={!(newMinitaskTitles[sub._id] || '').trim() || addMinitaskMutation.isPending}
                              onClick={() => {
                                const title = (newMinitaskTitles[sub._id] || '').trim();
                                if (!title) return;
                                addMinitaskMutation.mutate({
                                  subtaskId: sub._id,
                                  title,
                                  assigneeId: canAssignOthers ? (newMinitaskAssignees[sub._id] || undefined) : (currentUserIdStr || undefined)
                                });
                              }}
                              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40"
                            >
                              + Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Draft Subtasks List (Creating New Main Task) */}
              {!isEditing && draftSubtasks.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {draftSubtasks.map((st, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-blue-50/50 hover:bg-blue-50 border border-blue-200/60 transition-all group flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded shrink-0">
                            ST-{idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-slate-800 truncate">
                            {st.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Quick Interactive Date Badge / Popover for Draft Subtasks */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeDraftDateIndex === idx) {
                                  setActiveDraftDateIndex(null);
                                } else {
                                  setActiveDraftDateIndex(idx);
                                  setDatePopoverStart(st.startDate || '');
                                  setDatePopoverDue(st.dueDate || '');
                                }
                              }}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs transition-all cursor-pointer border ${
                                st.startDate || st.dueDate
                                  ? 'text-gray-700 bg-white hover:bg-blue-50/70 border-gray-200 hover:border-blue-300'
                                  : 'text-gray-400 bg-white hover:bg-blue-50/70 border-dashed border-gray-300 hover:border-blue-300 hover:text-blue-600'
                              }`}
                              title="Click to edit subtask start & stop dates"
                            >
                              <Calendar className={`w-2.5 h-2.5 ${st.startDate || st.dueDate ? 'text-blue-500' : 'text-gray-400'}`} />
                              <span>
                                {st.startDate || st.dueDate ? (
                                  <>
                                    {st.startDate ? st.startDate : 'Start'}
                                    {' - '}
                                    {st.dueDate ? st.dueDate : 'Stop'}
                                  </>
                                ) : (
                                  '+ Dates'
                                )}
                              </span>
                            </button>

                            {/* Floating Quick Date Editor Popover */}
                            {activeDraftDateIndex === idx && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1.5 z-50 p-3 bg-white border border-gray-200 rounded-2xl shadow-xl w-64 flex flex-col gap-2.5 animate-scale-in"
                              >
                                <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                                  <span className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Edit Draft Dates</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setActiveDraftDateIndex(null)}
                                    className="text-gray-400 hover:text-gray-600 cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Start Date</label>
                                    <input
                                      type="date"
                                      value={datePopoverStart}
                                      onChange={(e) => setDatePopoverStart(e.target.value)}
                                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-500 bg-gray-50/50"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Stop (Due) Date</label>
                                    <input
                                      type="date"
                                      value={datePopoverDue}
                                      onChange={(e) => setDatePopoverDue(e.target.value)}
                                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded-lg outline-none focus:border-blue-500 bg-gray-50/50"
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...draftSubtasks];
                                      updated[idx] = {
                                        ...updated[idx],
                                        startDate: undefined,
                                        dueDate: undefined
                                      };
                                      setDraftSubtasks(updated);
                                      const { minStart, maxDue } = syncDatesFromSubtasks(updated);
                                      if (minStart) setStartDate(minStart);
                                      if (maxDue) setDueDate(maxDue);
                                      setActiveDraftDateIndex(null);
                                    }}
                                    className="text-[10px] font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
                                  >
                                    Clear
                                  </button>

                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setActiveDraftDateIndex(null)}
                                      className="px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...draftSubtasks];
                                        updated[idx] = {
                                          ...updated[idx],
                                          startDate: datePopoverStart || undefined,
                                          dueDate: datePopoverDue || undefined
                                        };
                                        setDraftSubtasks(updated);
                                        if (datePopoverStart && (!startDate || datePopoverStart < startDate)) {
                                          setStartDate(datePopoverStart);
                                        }
                                        if (datePopoverDue && (!dueDate || datePopoverDue > dueDate)) {
                                          setDueDate(datePopoverDue);
                                        }
                                        setActiveDraftDateIndex(null);
                                      }}
                                      className="px-2.5 py-1 text-[11px] font-bold bg-[#0F172A] text-white hover:bg-[#1E293B] rounded-lg cursor-pointer"
                                    >
                                      Save Dates
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenDraftMicroIndex(openDraftMicroIndex === idx ? null : idx);
                                setDraftMicroTitle('');
                                setDraftMicroAssigneeId('');
                              }}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 shadow-2xs transition-all cursor-pointer border ${
                                (st.microtasks && st.microtasks.length > 0) || openDraftMicroIndex === idx
                                  ? 'text-purple-700 bg-purple-50 hover:bg-purple-100/70 border-purple-200'
                                  : 'text-gray-500 bg-white hover:bg-purple-50/70 border-gray-200 hover:border-purple-300'
                              }`}
                              title="Add microtasks to this queued subtask"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                              <span>+ Microtask{st.microtasks && st.microtasks.length > 0 ? ` (${st.microtasks.length})` : ''}</span>
                            </button>
                          </div>
                          {st.assigneeName ? (
                            <span className="text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs">
                              <User className="w-3 h-3 text-gray-400" />
                              {st.assigneeName}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-medium">Unassigned</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const remaining = draftSubtasks.filter((_, i) => i !== idx);
                              setDraftSubtasks(remaining);
                              if (remaining.length > 0) {
                                const { minStart, maxDue } = syncDatesFromSubtasks(remaining);
                                if (minStart) setStartDate(minStart);
                                if (maxDue) setDueDate(maxDue);
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                            title="Remove Subtask"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {st.description && (
                        <p className="text-[11px] text-gray-500 pl-8 truncate">{st.description}</p>
                      )}

                      {/* Draft Microtasks Section */}
                      {((st.microtasks && st.microtasks.length > 0) || openDraftMicroIndex === idx) && (
                        <div className="bg-slate-50/70 border-t border-gray-100 p-2.5 flex flex-col gap-2">
                          {st.microtasks && st.microtasks.length > 0 && (
                            <div className="space-y-1.5 pl-2 border-l-2 border-purple-200">
                              {st.microtasks.map((mic, micIdx) => (
                                <div
                                  key={micIdx}
                                  className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-gray-200/80 text-xs shadow-2xs"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <span className="text-[9px] font-mono font-bold text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200 shrink-0">
                                      MIC-{micIdx + 1}
                                    </span>
                                    <span className="truncate text-xs text-gray-800 font-medium">
                                      {mic.title}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
                                    <select
                                      value={mic.assigneeId || ''}
                                      onChange={(e) => {
                                        const updatedSubtasks = [...draftSubtasks];
                                        const targetMicros = [...(updatedSubtasks[idx].microtasks || [])];
                                        const selectedM = assignableMembers.find((m: any) => {
                                          const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                          return mId === e.target.value;
                                        });
                                        const selectedName = selectedM
                                          ? (typeof selectedM.userId === 'object' ? selectedM.userId?.name : selectedM.name) || selectedM.email
                                          : undefined;
                                        targetMicros[micIdx] = {
                                          ...targetMicros[micIdx],
                                          assigneeId: e.target.value || undefined,
                                          assigneeName: selectedName
                                        };
                                        updatedSubtasks[idx] = { ...updatedSubtasks[idx], microtasks: targetMicros };
                                        setDraftSubtasks(updatedSubtasks);
                                      }}
                                      className="text-[10px] bg-white border border-gray-200 hover:border-gray-300 rounded px-1.5 py-0.5 text-gray-700 outline-none cursor-pointer max-w-[100px] truncate shadow-2xs"
                                      title="Draft Microtask Assignee"
                                    >
                                      <option value="">Unassigned</option>
                                      {assignableMembers.map((m: any) => {
                                        const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                        const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                        return (
                                          <option key={mId} value={mId}>
                                            {mName}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedSubtasks = [...draftSubtasks];
                                        const remainingMicros = (updatedSubtasks[idx].microtasks || []).filter((_, mi) => mi !== micIdx);
                                        updatedSubtasks[idx] = {
                                          ...updatedSubtasks[idx],
                                          microtasks: remainingMicros
                                        };
                                        setDraftSubtasks(updatedSubtasks);
                                      }}
                                      className="p-0.5 text-gray-400 hover:text-rose-600 rounded cursor-pointer"
                                      title="Remove microtask"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {openDraftMicroIndex === idx && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <input
                                type="text"
                                placeholder="+ Add microtask..."
                                value={draftMicroTitle}
                                onChange={(e) => setDraftMicroTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const trimmed = draftMicroTitle.trim();
                                    if (!trimmed) return;
                                    const effAssigneeId = draftMicroAssigneeId || st.assigneeId || assigneeId;
                                    const memberObj = assignableMembers.find((m: any) => {
                                      const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                      return mId === effAssigneeId;
                                    });
                                    const mName = memberObj ? (typeof memberObj.userId === 'object' ? memberObj.userId?.name : memberObj.name) || memberObj.email : undefined;
                                    const updatedSubtasks = [...draftSubtasks];
                                    const curMicros = updatedSubtasks[idx].microtasks || [];
                                    updatedSubtasks[idx] = {
                                      ...updatedSubtasks[idx],
                                      microtasks: [...curMicros, { title: trimmed, assigneeId: effAssigneeId || undefined, assigneeName: mName }]
                                    };
                                    setDraftSubtasks(updatedSubtasks);
                                    setDraftMicroTitle('');
                                  }
                                }}
                                className="flex-1 px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg outline-none focus:border-purple-500"
                              />
                              <select
                                value={draftMicroAssigneeId}
                                onChange={(e) => setDraftMicroAssigneeId(e.target.value)}
                                className="text-[10px] bg-white border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 outline-none max-w-[110px] cursor-pointer truncate"
                              >
                                <option value="">Assignee (Default: {st.assigneeName || 'Unassigned'})</option>
                                {assignableMembers.map((m: any) => {
                                  const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                  const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                                  return (
                                    <option key={mId} value={mId}>
                                      {mName}
                                    </option>
                                  );
                                })}
                              </select>
                              <button
                                type="button"
                                disabled={!draftMicroTitle.trim()}
                                onClick={() => {
                                  const trimmed = draftMicroTitle.trim();
                                  if (!trimmed) return;
                                  const effAssigneeId = draftMicroAssigneeId || st.assigneeId || assigneeId;
                                  const memberObj = assignableMembers.find((m: any) => {
                                    const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                                    return mId === effAssigneeId;
                                  });
                                  const mName = memberObj ? (typeof memberObj.userId === 'object' ? memberObj.userId?.name : memberObj.name) || memberObj.email : undefined;
                                  const updatedSubtasks = [...draftSubtasks];
                                  const curMicros = updatedSubtasks[idx].microtasks || [];
                                  updatedSubtasks[idx] = {
                                    ...updatedSubtasks[idx],
                                    microtasks: [...curMicros, { title: trimmed, assigneeId: effAssigneeId || undefined, assigneeName: mName }]
                                  };
                                  setDraftSubtasks(updatedSubtasks);
                                  setDraftMicroTitle('');
                                }}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40"
                              >
                                + Add
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add Subtask Input & Expanded Details (Available in both Create and Edit modes) */}
              {(!isEditing || canManageSubtasks) && (
                <div className="flex flex-col gap-2 bg-gray-50/90 p-3 rounded-2xl border border-dashed border-gray-300">
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Add subtask summary..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newSubtaskTitle.trim() && !isAddSubtaskDetailsOpen) {
                          e.preventDefault();
                          if (isEditing) {
                            addSubtaskMutation.mutate({
                              title: newSubtaskTitle.trim(),
                              assigneeId: newSubtaskAssigneeId || undefined
                            });
                          } else {
                            const memberObj = assignableMembers.find((m: any) => {
                              const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                              return mId === newSubtaskAssigneeId;
                            });
                            const mName = memberObj ? (typeof memberObj.userId === 'object' ? memberObj.userId?.name : memberObj.name) || memberObj.email : undefined;
                            setDraftSubtasks([...draftSubtasks, { title: newSubtaskTitle.trim(), assigneeId: newSubtaskAssigneeId || undefined, assigneeName: mName }]);
                            setNewSubtaskTitle('');
                            setNewSubtaskAssigneeId('');
                          }
                        }
                      }}
                      className="flex-1 min-w-[140px] px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-[#0F172A]"
                    />
                    {canAssignOthers ? (
                      <select
                        value={newSubtaskAssigneeId}
                        onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
                        className="px-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-xl text-gray-700 outline-none cursor-pointer"
                      >
                        <option value="">Assign member...</option>
                        {assignableMembers.map((m: any) => {
                          const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                          const mName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                          return (
                            <option key={mId} value={mId}>
                              {mName}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-2.5 py-1.5 shrink-0 flex items-center gap-1" title="Assigned to you">
                        <User className="w-3.5 h-3.5 text-indigo-600" />
                        <span>{user?.name || (user?.email ? user.email.split('@')[0] : 'Me')}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsAddSubtaskDetailsOpen(!isAddSubtaskDetailsOpen)}
                      className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                        isAddSubtaskDetailsOpen
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                      title="Add details: Description, Start/Due dates"
                    >
                      {isAddSubtaskDetailsOpen ? 'Hide Details' : '+ Details'}
                    </button>
                    <button
                      type="button"
                      disabled={!newSubtaskTitle.trim() || (isEditing && addSubtaskMutation.isPending)}
                      onClick={() => {
                        if (newSubtaskTitle.trim()) {
                          if (isEditing) {
                            addSubtaskMutation.mutate({
                              title: newSubtaskTitle.trim(),
                              description: newSubtaskDescription || undefined,
                              startDate: newSubtaskStartDate || undefined,
                              dueDate: newSubtaskDueDate || undefined,
                              status: newSubtaskStatus || undefined,
                              assigneeId: newSubtaskAssigneeId || undefined
                            });
                            if (newSubtaskStartDate && (!startDate || newSubtaskStartDate < startDate)) {
                              setStartDate(newSubtaskStartDate);
                            }
                            if (newSubtaskDueDate && (!dueDate || newSubtaskDueDate > dueDate)) {
                              setDueDate(newSubtaskDueDate);
                            }
                          } else {
                            const effSubAssigneeId = newSubtaskAssigneeId || assigneeId;
                            const memberObj = assignableMembers.find((m: any) => {
                              const mId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                              return mId === effSubAssigneeId;
                            });
                            const mName = memberObj ? (typeof memberObj.userId === 'object' ? memberObj.userId?.name : memberObj.name) || memberObj.email : undefined;
                            setDraftSubtasks([
                              ...draftSubtasks,
                              {
                                title: newSubtaskTitle.trim(),
                                description: newSubtaskDescription || undefined,
                                startDate: newSubtaskStartDate || undefined,
                                dueDate: newSubtaskDueDate || undefined,
                                status: newSubtaskStatus || undefined,
                                assigneeId: effSubAssigneeId || undefined,
                                assigneeName: mName
                              }
                            ]);
                            if (newSubtaskStartDate && (!startDate || newSubtaskStartDate < startDate)) {
                              setStartDate(newSubtaskStartDate);
                            }
                            if (newSubtaskDueDate && (!dueDate || newSubtaskDueDate > dueDate)) {
                              setDueDate(newSubtaskDueDate);
                            }
                            setNewSubtaskTitle('');
                            setNewSubtaskDescription('');
                            setNewSubtaskStartDate('');
                            setNewSubtaskDueDate('');
                            setNewSubtaskStatus('');
                            setNewSubtaskAssigneeId('');
                            setIsAddSubtaskDetailsOpen(false);
                          }
                        }
                      }}
                      className="px-3.5 py-1.5 bg-[#0F172A] text-white rounded-xl text-xs font-bold hover:bg-[#1E293B] transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      + Add Subtask
                    </button>
                  </div>

                  {/* Expandable fields for new subtask */}
                  {isAddSubtaskDetailsOpen && (
                    <div className="pt-2 border-t border-gray-200 flex flex-col gap-2 animate-slide-up">
                      <div>
                        <textarea
                          rows={2}
                          placeholder="Subtask description..."
                          value={newSubtaskDescription}
                          onChange={(e) => setNewSubtaskDescription(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-[#0F172A] resize-y"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Start Date</label>
                          <input
                            type="date"
                            value={newSubtaskStartDate}
                            onChange={(e) => setNewSubtaskStartDate(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-xl outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">End Date (Due Date)</label>
                          <input
                            type="date"
                            value={newSubtaskDueDate}
                            onChange={(e) => setNewSubtaskDueDate(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-xl outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Initial Stage</label>
                          <select
                            value={newSubtaskStatus}
                            onChange={(e) => setNewSubtaskStatus(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-xl outline-none"
                          >
                            <option value="">Default (First Stage)</option>
                            {workflowStages.map((st: any) => (
                              <option key={st.id} value={st.id}>{st.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Attachments Section (Drag & Drop + Lightbox) */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-gray-600 tracking-wide uppercase flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                    <span>Attachments</span>
                  </label>
                  {activeTask?.attachments && activeTask.attachments.length > 0 && (
                    <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {activeTask.attachments.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Upload Drop Zone */}
              {isEditing && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDraggingFile(false);
                    handleFileUpload(e.dataTransfer.files);
                  }}
                  className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isDraggingFile
                      ? 'border-[#22C55E] bg-emerald-50/50'
                      : 'border-gray-200 hover:border-gray-300 bg-gray-50/50 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    const input = document.getElementById('task-file-upload-input');
                    if (input) input.click();
                  }}
                >
                  <input
                    id="task-file-upload-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 shadow-2xs">
                    {uploadAttachmentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#0F172A]" />
                    ) : (
                      <UploadCloud className="w-4 h-4 text-[#0F172A]" />
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-700">
                    {uploadAttachmentMutation.isPending ? 'Uploading...' : 'Drop files to attach, or browse'}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    Supports files up to 200 KB
                  </span>
                </div>
              )}

              {/* Attachments List / Grid */}
              {activeTask?.attachments && activeTask.attachments.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {activeTask.attachments.map((att: any) => {
                    const isImg = att.mimeType?.startsWith('image/') || att.url?.match(/\.(jpeg|jpg|gif|png|webp)$/i);
                    const fileUrl = att.url?.startsWith('http')
                      ? att.url
                      : `${getBackendUrl()}${att.url?.startsWith('/') ? '' : '/'}${att.url}`;

                    return (
                      <div
                        key={att._id}
                        className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden p-2 flex flex-col gap-1.5 shadow-2xs hover:shadow-md transition-all"
                      >
                        {/* Thumbnail / Icon preview */}
                        <div
                          onClick={() => {
                            if (isImg) setLightboxImage(fileUrl);
                            else window.open(fileUrl, '_blank');
                          }}
                          className="w-full h-24 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer relative"
                        >
                          {isImg ? (
                            <img
                              src={fileUrl}
                              alt={att.originalName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <File className="w-8 h-8 text-gray-400" />
                          )}
                        </div>

                        {/* File Details */}
                        <div className="flex items-center justify-between text-[11px] px-1">
                          <span className="font-bold text-[#111827] truncate max-w-[120px]" title={att.originalName}>
                            {att.originalName}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {Math.round((att.size || 1024) / 1024)} KB
                          </span>
                        </div>

                        {/* Hover Actions */}
                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={fileUrl}
                            download={att.originalName}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 bg-white/90 hover:bg-white text-gray-700 rounded-lg shadow-xs border border-gray-200"
                            title="Download"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => deleteAttachmentMutation.mutate(att._id)}
                            className="p-1 bg-white/90 hover:bg-rose-50 text-rose-600 rounded-lg shadow-xs border border-gray-200"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Linked Work Items (Point 5) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-600 tracking-wide uppercase flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-gray-400" />
                  <span>Linked work items</span>
                </label>
              </div>

              {/* Active Linked Issues List */}
              {activeTask?.linkedIssues && activeTask.linkedIssues.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {activeTask.linkedIssues.map((link: any) => {
                    const target = link.targetTaskId;
                    if (!target) return null;
                    const targetKey = typeof target === 'object' ? target.key : 'ISSUE';
                    const targetTitle = typeof target === 'object' ? target.title : 'Linked Issue';
                    const targetStatus = typeof target === 'object' ? target.status : 'TODO';

                    const linkLabel =
                      link.type === 'blocks'
                        ? 'Blocks'
                        : link.type === 'is_blocked_by'
                        ? 'Is blocked by'
                        : link.type === 'duplicates'
                        ? 'Duplicates'
                        : 'Relates to';

                    return (
                      <div
                        key={link._id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            {linkLabel}
                          </span>
                          <span className="font-mono font-bold text-[#0F172A]">{targetKey}</span>
                          <span className="text-gray-600 truncate max-w-[200px]">{targetTitle}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600">
                            {targetStatus}
                          </span>
                          <button
                            type="button"
                            onClick={() => unlinkTaskMutation.mutate(link._id)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Remove link"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Link Form / Trigger */}
              {isEditing && (
                <div>
                  {isLinkingOpen ? (
                    <div className="p-3 bg-white border border-gray-200 rounded-2xl flex flex-col gap-2.5 shadow-xs animate-slide-up">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#111827]">Link another work item</span>
                        <button
                          type="button"
                          onClick={() => setIsLinkingOpen(false)}
                          className="text-gray-400 hover:text-[#111827]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            Relationship
                          </label>
                          <select
                            value={linkType}
                            onChange={(e) => setLinkType(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                          >
                            <option value="blocks">Blocks</option>
                            <option value="is_blocked_by">Is blocked by</option>
                            <option value="relates_to">Relates to</option>
                            <option value="duplicates">Duplicates</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                            Target Issue
                          </label>
                          <select
                            value={targetTaskId}
                            onChange={(e) => setTargetTaskId(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none"
                          >
                            <option value="">Select target issue...</option>
                            {linkableTasks
                              .filter((t: any) => t._id !== activeTask._id)
                              .map((t: any) => (
                                <option key={t._id} value={t._id}>
                                  {t.key}: {t.title}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setIsLinkingOpen(false)}
                          className="px-3 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!targetTaskId || linkTaskMutation.isPending}
                          onClick={() =>
                            linkTaskMutation.mutate({
                              targetTaskId,
                              type: linkType
                            })
                          }
                          className="px-3.5 py-1 bg-[#0F172A] text-white text-xs font-bold rounded-xl hover:bg-[#1E293B] transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {linkTaskMutation.isPending ? 'Linking...' : 'Link Issue'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsLinkingOpen(true)}
                      className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-[#111827] px-3 py-2 rounded-xl border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all text-left cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add linked work item</span>
                    </button>
                  )}
                </div>
              )}
            </div>


            {/* Activity Section with Tabs */}
            <div className="flex flex-col gap-3 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">Activity</label>
                <div className="flex items-center gap-1 bg-[#F3F4F6] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setActiveActivityTab('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeActivityTab === 'all' ? 'bg-white text-[#0F172A] shadow-2xs' : 'text-gray-500 hover:text-[#111827]'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveActivityTab('comments')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeActivityTab === 'comments'
                        ? 'bg-white text-[#0F172A] shadow-2xs'
                        : 'text-gray-500 hover:text-[#111827]'
                    }`}
                  >
                    Comments {commentsData && commentsData.length > 0 && `(${commentsData.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveActivityTab('history')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeActivityTab === 'history'
                        ? 'bg-white text-[#0F172A] shadow-2xs'
                        : 'text-gray-500 hover:text-[#111827]'
                    }`}
                  >
                    History {activitiesData && activitiesData.length > 0 && `(${activitiesData.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveActivityTab('worklog')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      activeActivityTab === 'worklog'
                        ? 'bg-white text-[#0F172A] shadow-2xs'
                        : 'text-gray-500 hover:text-[#111827]'
                    }`}
                  >
                    Work log {workLogs.length > 0 && `(${workLogs.length})`}
                  </button>
                </div>
              </div>

              {/* Activity Tab Content */}
              {activeActivityTab === 'comments' && (
                <div className="flex flex-col gap-4">
                  {/* Add Comment Input */}
                  {isEditing && canComment && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {user?.name?.charAt(0) || 'U'}
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <textarea
                          rows={2}
                          placeholder="Add a comment..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl outline-none focus:border-[#0F172A] transition-all"
                        />
                        {commentText.trim() && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={commentMutation.isPending}
                              onClick={() => commentMutation.mutate(commentText.trim())}
                              className="px-3 py-1 bg-[#0F172A] text-white rounded-lg text-xs font-bold hover:bg-[#1E293B] cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setCommentText('')}
                              className="px-3 py-1 text-gray-500 hover:text-[#111827] text-xs font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Comment List */}
                  <div className="flex flex-col gap-3">
                    {commentsData && commentsData.length > 0 ? (
                      commentsData.map((c: any) => (
                        <div key={c._id} className="flex gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-200/80">
                          <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs shrink-0">
                            {c.userId?.name?.charAt(0) || c.createdBy?.name?.charAt(0) || 'U'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-[#111827]">{c.userId?.name || c.createdBy?.name || 'Member'}</span>
                              <span className="text-[11px] text-gray-400">{formatRelativeTime(c.createdAt)}</span>
                            </div>
                            <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{c.content}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-gray-400 font-medium">
                        No comments yet. Start the conversation!
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* History Tab */}
              {(activeActivityTab === 'history' || activeActivityTab === 'all') && (
                <div className="flex flex-col gap-3">
                  {activitiesData && activitiesData.length > 0 ? (
                    activitiesData.map((act: any) => {
                      const isSubtaskAct = act.action?.startsWith('SUBTASK_') || act.field === 'subtasks';

                      return (
                        <div key={act._id} className="flex gap-3 text-xs text-gray-600 py-2 border-b border-gray-100 last:border-none">
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                            {act.userId?.name?.charAt(0) || 'U'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-[#111827]">{act.userId?.name || 'User'}</span>

                              {isSubtaskAct ? (
                                <>
                                  {act.action === 'SUBTASK_ADDED' && <span>added subtask</span>}
                                  {act.action === 'SUBTASK_STATUS_CHANGED' && <span>changed stage of subtask</span>}
                                  {act.action === 'SUBTASK_ASSIGNED' && <span>assigned subtask</span>}
                                  {act.action === 'SUBTASK_UPDATED' && (
                                    <span>
                                      updated subtask {act.metadata?.subtaskField ? `(${act.metadata.subtaskField})` : ''}
                                    </span>
                                  )}
                                  {act.action === 'SUBTASK_DELETED' && <span>deleted subtask</span>}

                                  {act.metadata?.subtaskKey && (
                                    <span className="font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                      {act.metadata.subtaskKey}
                                    </span>
                                  )}
                                </>
                              ) : act.action === 'ATTACHMENT_ADDED' ? (
                                <span>uploaded attachment</span>
                              ) : act.action === 'ATTACHMENT_REMOVED' ? (
                                <span>removed attachment</span>
                              ) : (
                                <>
                                  <span>changed the</span>
                                  <span className="font-semibold text-[#0F172A] capitalize">{act.field || act.action}</span>
                                </>
                              )}

                              <span className="text-gray-400 text-[10px] ml-auto">{formatRelativeTime(act.createdAt)}</span>
                            </div>

                            {/* Values Before -> After */}
                            {act.action === 'SUBTASK_ADDED' && (
                              <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-1 inline-block">
                                "{act.newValue || act.metadata?.title}"
                              </div>
                            )}

                            {act.action === 'SUBTASK_DELETED' && (
                              <div className="text-[11px] text-gray-500 line-through mt-1">
                                "{act.oldValue}"
                              </div>
                            )}

                            {act.action === 'ATTACHMENT_ADDED' && (
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-1 inline-flex">
                                <Paperclip className="w-3 h-3 text-emerald-600" />
                                <span>{act.newValue}</span>
                              </div>
                            )}

                            {act.action === 'ATTACHMENT_REMOVED' && (
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 line-through bg-gray-50 px-2 py-0.5 rounded border border-gray-200 mt-1 inline-flex">
                                <Paperclip className="w-3 h-3 text-gray-400" />
                                <span>{act.oldValue}</span>
                              </div>
                            )}

                            {act.action !== 'SUBTASK_ADDED' && act.action !== 'SUBTASK_DELETED' && act.action !== 'ATTACHMENT_ADDED' && act.action !== 'ATTACHMENT_REMOVED' && act.oldValue !== undefined && act.newValue !== undefined && (
                              <div className="flex items-center gap-2 mt-1 text-gray-500 text-[11px]">
                                <span className="line-through text-gray-400">{String(act.oldValue || 'None')}</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                <span className="font-semibold text-emerald-600">{String(act.newValue || 'None')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-xs text-gray-400 font-medium">No activity history logged yet.</div>
                  )}
                </div>
              )}

              {/* Work Log Tab (Matching User Screenshot!) */}
              {activeActivityTab === 'worklog' && (
                <div className="flex flex-col gap-4">
                  {workLogs.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-emerald-800 text-xs">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-emerald-600" />
                          <span className="font-bold">Total Time Logged:</span>
                          <span>{totalWorkMinutes} minutes ({Math.round((totalWorkMinutes / 60) * 10) / 10} hours)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsLogWorkOpen(true)}
                          className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer text-xs"
                        >
                          + Log More Time
                        </button>
                      </div>

                      {workLogs.map((wl: any) => (
                        <div key={wl._id} className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                          <div className="w-6 h-6 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                            {wl.userId?.name?.charAt(0) || 'U'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#111827]">{wl.userId?.name || 'Member'}</span>
                              <span className="text-gray-400 text-[10px]">{formatRelativeTime(wl.createdAt)}</span>
                            </div>
                            <div className="font-bold text-emerald-600 mt-0.5">{wl.timeSpentMinutes} minutes logged</div>
                            {wl.description && <p className="text-gray-600 mt-1">{wl.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                      {/* Stopwatch Illustration from User Screenshot */}
                      <div className="w-20 h-20 rounded-full bg-blue-50 border-4 border-blue-400 flex items-center justify-center relative mb-4 shadow-inner">
                        <div className="w-2.5 h-4 bg-slate-700 rounded-t-sm absolute -top-4" />
                        <div className="w-4 h-2.5 bg-amber-400 rounded absolute -top-2 -right-1 rotate-45" />
                        <div className="w-4 h-2.5 bg-amber-400 rounded absolute -top-2 -left-1 -rotate-45" />
                        <div className="w-10 h-10 rounded-full bg-[#0F172A] flex items-center justify-center">
                          <div className="w-0.5 h-4 bg-blue-400 origin-bottom rotate-45" />
                        </div>
                      </div>

                      <h4 className="text-xs font-bold text-[#111827] mb-1">
                        No time was logged for this {issueType.toLowerCase()} yet.
                      </h4>
                      <p className="text-[11px] text-gray-500 max-w-sm mb-4">
                        Logging time lets you track and report on the time spent on the work.
                      </p>

                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => setIsLogWorkOpen(true)}
                          className="px-4 py-2 bg-[#0F172A] text-white rounded-xl text-xs font-bold hover:bg-[#1E293B] transition-colors shadow-sm cursor-pointer"
                        >
                          + Log Time
                        </button>
                      )}
                    </div>
                  )}

                  {/* Log Work Modal Form */}
                  {isLogWorkOpen && (
                    <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl flex flex-col gap-3 animate-slide-up">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                          <Timer className="w-4 h-4 text-blue-600" />
                          <span>Log Work Time</span>
                        </span>
                        <button onClick={() => setIsLogWorkOpen(false)} className="text-gray-400 hover:text-[#111827] cursor-pointer">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">Time spent (minutes) *</label>
                          <input
                            type="number"
                            min="1"
                            value={logMinutes}
                            onChange={(e) => setLogMinutes(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:border-[#0F172A]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">Work Description</label>
                          <input
                            type="text"
                            placeholder="e.g. Implemented indexes & ran tests"
                            value={logDesc}
                            onChange={(e) => setLogDesc(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs bg-white border border-gray-300 rounded-xl outline-none focus:border-[#0F172A]"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsLogWorkOpen(false)}
                          className="px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!logMinutes || Number(logMinutes) <= 0 || logWorkMutation.isPending}
                          onClick={() =>
                            logWorkMutation.mutate({
                              minutes: Number(logMinutes),
                              description: logDesc
                            })
                          }
                          className="px-3.5 py-1 bg-[#0F172A] text-white text-xs font-bold rounded-xl hover:bg-[#1E293B] transition-colors cursor-pointer"
                        >
                          Save Log
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* All Tab */}
              {activeActivityTab === 'all' && (
                <div className="flex flex-col gap-3">
                  <div className="text-xs text-gray-500 font-semibold mb-1">Unified Audit & Comment Feed</div>
                  {activitiesData && activitiesData.length > 0 ? (
                    activitiesData.map((act: any) => (
                      <div key={act._id} className="flex gap-3 text-xs text-gray-600 py-1.5 border-b border-gray-100">
                        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {act.userId?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-[#111827]">{act.userId?.name || 'User'}</span>
                            <span>{act.action}</span>
                            <span className="text-gray-400 text-[10px] ml-auto">{formatRelativeTime(act.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-xs text-gray-400 font-medium">No activity items.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Details Sidebar Pane */}
          <div className="w-full lg:w-80 p-6 bg-[#F3F4F6]/40 flex flex-col gap-5 select-none">
            {/* Status Stage Selector */}
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Status Stage
              </label>
              <select
                value={status}
                disabled={!canChangeStatus}
                onChange={(e) => setStatus(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-bold text-[#111827] bg-white border border-gray-300 rounded-xl outline-none focus:border-[#0F172A] shadow-2xs hover:border-gray-400 transition-colors ${
                  !canChangeStatus ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {workflowStages.map((stage: any) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Collapsible Details Section Header */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                className="flex items-center gap-1 text-xs font-bold text-[#111827] cursor-pointer"
              >
                {isDetailsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span>Details</span>
              </button>
              <Settings className="w-3.5 h-3.5 text-gray-400" />
            </div>

            {/* Details Fields */}
            {isDetailsOpen && (
              <div className="flex flex-col gap-4 text-xs">
                {/* Project Space Selection */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Project Space</label>
                  <select
                    value={activeProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={isEditing || !canEditFullFields}
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl font-bold text-[#111827] outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {projects && projects.length > 0 ? (
                      projects.map((p: any) => (
                        <option key={p._id} value={p._id}>
                          {p.name} ({p.key})
                        </option>
                      ))
                    ) : (
                      <option value={activeProjectId}>Current Project</option>
                    )}
                  </select>
                </div>

                {/* Assignee Selection (Strictly filtered by selected Team) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-gray-500">Assignee</label>
                    {selectedTeamObj && (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        {selectedTeamObj.name} ({assignableMembers.length} {assignableMembers.length === 1 ? 'member' : 'members'})
                      </span>
                    )}
                  </div>
                  <select
                    value={assigneeId}
                    disabled={!canAssignOthers}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="">Unassigned</option>
                    {assignableMembers.length === 0 && selectedTeamObj ? (
                      <option disabled value="">(No members assigned to this team)</option>
                    ) : (
                      assignableMembers.map((m: any) => {
                        const memberId = (typeof m.userId === 'object' ? m.userId?._id : m.userId) || m._id;
                        const memberName = (typeof m.userId === 'object' ? m.userId?.name : m.name) || (m.email ? m.email.split('@')[0] : 'Member');
                        const memberEmail = (typeof m.userId === 'object' ? m.userId?.email : m.email) || '';
                        const isLead = selectedTeamObj && (
                          (typeof selectedTeamObj.leadId === 'object' ? selectedTeamObj.leadId?._id : selectedTeamObj.leadId)?.toString() === memberId?.toString()
                        );
                        const role = m.roleOverride || (isLead ? 'Team Lead' : (m.role || (typeof m.userId === 'object' && m.userId?.role) || m.jobTitle || ''));
                        const roleLabel = role ? ` • [${role.replace(/_/g, ' ')}]` : '';
                        return (
                          <option key={memberId} value={memberId}>
                            {memberName} {memberEmail && memberEmail !== memberName ? `(${memberEmail})` : ''}{roleLabel}
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Priority</label>
                  <select
                    value={priority}
                    disabled={!canEditFullFields}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="LOWEST">Lowest</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>

                {/* Dates: Due Date & Start Date */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1 flex items-center justify-between">
                      <span>Due Date</span>
                      {(draftSubtasks.some(st => st.dueDate) || (activeTask?.subtasks && activeTask.subtasks.some((st: any) => st.dueDate))) && (
                        <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60">Auto-filled</span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      disabled={!canEditFullFields}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1 flex items-center justify-between">
                      <span>Start Date</span>
                      {(draftSubtasks.some(st => st.startDate) || (activeTask?.subtasks && activeTask.subtasks.some((st: any) => st.startDate))) && (
                        <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60">Auto-filled</span>
                      )}
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      disabled={!canEditFullFields}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Sprint */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Sprint</label>
                  <select
                    value={sprintId}
                    disabled={!canEditFullFields}
                    onChange={(e) => setSprintId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    <option value="">No Sprint (Backlog)</option>
                    {sprintsData?.map((s: any) => {
                      const sprintTeamsStr = s.teams && s.teams.length > 0 ? s.teams.join(', ') : 'All Teams';
                      return (
                        <option key={s._id} value={s._id}>
                          {s.name} • [{formatSprintStatus(s.status)}] — [{sprintTeamsStr}]
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Team */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-gray-500">Team</label>
                    {isLevel3 && !isLevel1 && !isLevel2 && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Restricted to Your Team
                      </span>
                    )}
                  </div>

                  {/* Team Lead with 1 team: Lock to their team */}
                  {isLevel3 && !isLevel1 && !isLevel2 && myLeadTeams.length === 1 ? (
                    <div className="flex flex-col gap-1">
                      <div className="w-full px-3 py-2 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                          <span className="font-bold text-[#111827]">{myLeadTeams[0].name}</span>
                        </div>
                        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                          Your Team (Locked)
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 italic">
                        As Team Lead, tasks you create are strictly scoped to your team.
                      </p>
                    </div>
                  ) : isLevel3 && !isLevel1 && !isLevel2 && myLeadTeams.length > 1 ? (
                    /* Team Lead with multiple teams: Choose only among their lead teams */
                    <div className="flex flex-col gap-1">
                      <select
                        value={team}
                        disabled={!canEditFullFields}
                        onChange={(e) => {
                          const newTeam = e.target.value;
                          setTeam(newTeam);
                          if (newTeam && assigneeId) {
                            const newTeamObj = projectTeams.find((pt: any) => pt.name === newTeam);
                            if (newTeamObj) {
                              const leadId = (newTeamObj.leadId?._id || newTeamObj.leadId)?.toString();
                              const memberIds = Array.isArray(newTeamObj.members)
                                ? newTeamObj.members.map((m: any) => (m._id || m.userId?._id || m.userId || m)?.toString())
                                : [];
                              if (assigneeId.toString() !== leadId && !memberIds.includes(assigneeId.toString())) {
                                setAssigneeId('');
                              }
                            }
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        {myLeadTeams.map((pt: any) => (
                          <option key={pt._id || pt.name} value={pt.name}>
                            {pt.name} (Your Team)
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-500 italic">
                        Select one of your assigned teams.
                      </p>
                    </div>
                  ) : isLevel3 && !isLevel1 && !isLevel2 && myLeadTeams.length === 0 ? (
                    /* Team Lead with no assigned team */
                    <div className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700">
                      You are not assigned as Team Lead for any team in this project.
                    </div>
                  ) : projectTeams && projectTeams.length > 0 ? (
                    /* Admins / PMs view */
                    <div className="flex flex-col gap-1">
                      <select
                        value={projectTeams.some((pt: any) => pt.name === team) ? team : team ? '__CUSTOM__' : ''}
                        disabled={!canEditFullFields}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newTeam = val === '__CUSTOM__' ? '' : val;
                          setTeam(newTeam);
                          if (newTeam && assigneeId) {
                            const newTeamObj = projectTeams.find((pt: any) => pt.name === newTeam);
                            if (newTeamObj) {
                              const leadId = (newTeamObj.leadId?._id || newTeamObj.leadId)?.toString();
                              const memberIds = Array.isArray(newTeamObj.members)
                                ? newTeamObj.members.map((m: any) => (m._id || m.userId?._id || m.userId || m)?.toString())
                                : [];
                              if (assigneeId.toString() !== leadId && !memberIds.includes(assigneeId.toString())) {
                                setAssigneeId('');
                              }
                            }
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                      >
                        <option value="">General (No Team)</option>
                        {projectTeams.map((pt: any) => (
                          <option key={pt._id || pt.name} value={pt.name}>
                            {pt.name}
                          </option>
                        ))}
                        <option value="__CUSTOM__">+ Custom Team...</option>
                      </select>
                      {!projectTeams.some((pt: any) => pt.name === team) && (
                        <input
                          type="text"
                          disabled={!canEditFullFields}
                          placeholder="Type custom team name..."
                          value={team}
                          onChange={(e) => setTeam(e.target.value)}
                          className="w-full px-2.5 py-1 text-xs bg-white border border-dashed border-gray-300 rounded-lg outline-none focus:border-[#0F172A] disabled:opacity-75 disabled:cursor-not-allowed"
                        />
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      disabled={!canEditFullFields}
                      placeholder="e.g. Hardware & PCB"
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-xl font-medium text-[#111827] outline-none disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  )}
                </div>



                {/* Reporter & Metadata */}
                <div className="pt-3 border-t border-gray-200 flex flex-col gap-1.5 text-[11px] text-gray-500">
                  <div className="flex items-center justify-between">
                    <span>Reporter</span>
                    <span className="font-bold text-[#111827]">
                      {activeTask?.reporterId?.name || user?.name || 'Admin'}
                    </span>
                  </div>
                  {activeTask?.createdAt && (
                    <div className="flex items-center justify-between">
                      <span>Created</span>
                      <span>{new Date(activeTask.createdAt).toLocaleDateString()}</span>
                    </div>
                  )}
                  {activeTask?.updatedAt && (
                    <div className="flex items-center justify-between">
                      <span>Updated</span>
                      <span>{new Date(activeTask.updatedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Task Lock Status Banner */}
            {isEditing && isTaskLocked && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-800">
                <div className="flex items-center gap-2 min-w-0">
                  <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold truncate">Main Task is Locked</div>
                    <div className="text-[10px] text-rose-700 truncate">
                      By {activeTask?.lockedBy?.name || 'Lead/Admin'} (Deletion blocked)
                    </div>
                  </div>
                </div>
                {canUnlock && (
                  <button
                    type="button"
                    disabled={toggleLockMutation.isPending}
                    onClick={() => toggleLockMutation.mutate({})}
                    className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-300 text-[10px] shrink-0 cursor-pointer shadow-2xs"
                  >
                    Unlock
                  </button>
                )}
              </div>
            )}

            {/* Modal Bottom Save Action */}
            <div className="pt-4 border-t border-gray-200 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-3 py-2 border border-gray-300 hover:bg-gray-100 rounded-xl text-xs font-bold text-gray-700 transition-colors cursor-pointer text-center"
                >
                  Close
                </button>
                {canSave ? (
                  <button
                    type="button"
                    disabled={createMutation.isPending || updateMutation.isPending || deleteTaskMutation.isPending}
                    onClick={() => handleSubmit()}
                    className="flex-1 px-4 py-2 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    <span>
                      {isEditing
                        ? isLevel4 && !canEditFullFields
                          ? 'Update Stage'
                          : 'Save Changes'
                        : draftSubtasks.length > 0
                        ? `Create Main Task (${draftSubtasks.length} Subtasks)`
                        : 'Create Main Task'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-400 rounded-xl text-xs font-bold cursor-not-allowed flex items-center justify-center gap-1.5 border border-gray-200"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>View Only</span>
                  </button>
                )}
              </div>

              {isEditing && canDeleteTask && (
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={deleteTaskMutation.isPending}
                  className="w-full py-1.5 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50/60 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Move to Recycle Bin (30-day recovery)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-black/40 rounded-2xl overflow-hidden border border-white/20 shadow-2xl flex flex-col items-center"
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/60 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <img
              src={lightboxImage}
              alt="Attachment Full View"
              className="max-h-[85vh] w-auto object-contain rounded-xl"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && activeTask && (
        <DeleteConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={() => deleteTaskMutation.mutateAsync()}
          title="Move Task to Recycle Bin?"
          itemName={`${activeTask.key ? `[${activeTask.key}] ` : ''}${activeTask.title}`}
          itemType="Task"
          isLoading={deleteTaskMutation.isPending}
        />
      )}
    </div>,
    document.body
  );
};


