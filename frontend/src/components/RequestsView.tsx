'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  Inbox,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  MessageSquare,
  Send,
  User,
  Check,
  X,
  Plus,
  RefreshCw,
  Loader2,
  Bug,
  Briefcase,
  HelpCircle,
  ShieldCheck,
  ExternalLink,
  Kanban,
  Zap,
  ArrowUpRight,
  Trash2
} from 'lucide-react';
import { DeleteConfirmModal } from './DeleteConfirmModal';

interface RequestsViewProps {
  projectId: string;
}

export const RequestsView: React.FC<RequestsViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [newCommentText, setNewCommentText] = useState('');

  // Accept & Create Board Task Modal State
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [acceptTargetStatus, setAcceptTargetStatus] = useState<'ACCEPTED' | 'IN_PROGRESS'>('IN_PROGRESS');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('unassigned');
  const [selectedSprintId, setSelectedSprintId] = useState<string>('backlog');
  const [selectedPriority, setSelectedPriority] = useState<string>('MEDIUM');
  const [acceptanceNote, setAcceptanceNote] = useState<string>('');

  // Direct Resolve Modal State (Action 1: Resolve Immediately without board clutter)
  const [isResolveDirectModalOpen, setIsResolveDirectModalOpen] = useState(false);
  const [resolveDirectNote, setResolveDirectNote] = useState<string>('');

  // Reject Modal State (Action 3: Reject)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // 1. Fetch Requests for this project
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['project-requests', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/requests`);
      return res.data.data;
    },
    enabled: !!projectId,
    refetchInterval: 3000 // Realtime polling every 3s
  });

  // 1.1 Fetch Project Members for Assignee selection
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/members`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });

  // 1.2 Fetch Sprints for Sprint assignment
  const { data: sprints = [] } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/sprints`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });

  const selectedRequest = requests.find((r: any) => r._id === selectedRequestId) || (requests.length > 0 ? requests[0] : null);

  const currentUserId = user?._id || user?.id;
  const isSuperOrOrgAdmin = ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_MANAGER'].includes(user?.role || '');
  const isTeamLeadOfRequest =
    selectedRequest?.teamLeadId?._id === currentUserId ||
    selectedRequest?.teamLeadId === currentUserId ||
    user?.role === 'TEAM_LEAD';
  const canActAsLead = isSuperOrOrgAdmin || isTeamLeadOfRequest;

  // Delete Request state & mutation
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const canDeleteRequest =
    isSuperOrOrgAdmin ||
    selectedRequest?.reporterId?._id === currentUserId ||
    selectedRequest?.reporterId === currentUserId ||
    isTeamLeadOfRequest;

  const deleteRequestMutation = useMutation({
    mutationFn: async (reqId: string) => {
      const res = await api.delete(`/projects/${projectId}/requests/${reqId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-requests', projectId] });
      setIsDeleteModalOpen(false);
      setSelectedRequestId(null);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to move request to Recycle Bin');
      setIsDeleteModalOpen(false);
    }
  });

  // 2. Mutation to Update Request Status (3 Team Lead Actions)
  const updateStatusMutation = useMutation({
    mutationFn: async (payload: {
      requestId: string;
      requestStatus?: string;
      actionType?: 'RESOLVE_DIRECTLY' | 'CREATE_TASK' | 'REJECT';
      createBoardTask?: boolean;
      assigneeId?: string;
      sprintId?: string;
      sprint?: string;
      priority?: string;
      note?: string;
    }) => {
      const res = await api.patch(`/projects/${projectId}/requests/${payload.requestId}/status`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-requests', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      setIsAcceptModalOpen(false);
      setIsRejectModalOpen(false);
      setIsResolveDirectModalOpen(false);
      setRejectionReason('');
      setAcceptanceNote('');
      setResolveDirectNote('');
    }
  });

  // 3. Mutation to Add Comment on Request
  const addCommentMutation = useMutation({
    mutationFn: async ({ requestId, content }: { requestId: string; content: string }) => {
      const res = await api.post(`/projects/${projectId}/requests/${requestId}/comments`, { content });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-requests', projectId] });
      setNewCommentText('');
    }
  });

  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || !selectedRequest) return;
    addCommentMutation.mutate({
      requestId: selectedRequest._id,
      content: newCommentText.trim()
    });
  };

  const handleOpenAcceptModal = (targetStatus: 'ACCEPTED' | 'IN_PROGRESS') => {
    if (!selectedRequest) return;
    setAcceptTargetStatus(targetStatus);

    // If Dependency Request / Request to Work, default assignee to the Requester
    const isWorkRequest = selectedRequest.requestType === 'REQUEST_TO_WORK' || selectedRequest.requestType === 'DEPENDENCY_REQUEST';
    const requesterId = selectedRequest.reporterId?._id || selectedRequest.reporterId;
    const defaultAssignee = isWorkRequest
      ? requesterId
      : selectedRequest.assigneeId?._id || selectedRequest.assigneeId || currentUserId || 'unassigned';

    setSelectedAssignee(defaultAssignee);

    // Find active sprint if available
    const activeSprint = sprints.find((s: any) => s.status === 'ACTIVE');
    setSelectedSprintId(selectedRequest.sprintId || activeSprint?._id || 'backlog');
    setSelectedPriority(selectedRequest.priority || 'MEDIUM');
    setAcceptanceNote('');
    setIsAcceptModalOpen(true);
  };

  const handleConfirmResolveDirect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    updateStatusMutation.mutate({
      requestId: selectedRequest._id,
      actionType: 'RESOLVE_DIRECTLY',
      requestStatus: 'COMPLETED',
      note: resolveDirectNote.trim() || 'Directly resolved by Team Lead.'
    });
  };

  const handleConfirmAcceptance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    const chosenSprintObj = sprints.find((s: any) => s._id === selectedSprintId);

    updateStatusMutation.mutate({
      requestId: selectedRequest._id,
      actionType: 'CREATE_TASK',
      createBoardTask: true,
      requestStatus: 'IN_PROGRESS',
      assigneeId: selectedAssignee,
      sprintId: selectedSprintId,
      sprint: chosenSprintObj?.name || (selectedSprintId === 'backlog' ? 'Backlog' : 'Sprint 1'),
      priority: selectedPriority,
      note: acceptanceNote.trim() || undefined
    });
  };

  const handleConfirmRejection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    updateStatusMutation.mutate({
      requestId: selectedRequest._id,
      actionType: 'REJECT',
      requestStatus: 'REJECTED',
      note: rejectionReason.trim() || 'Request rejected by Team Lead.'
    });
  };

  const handleQuickStatusChange = (status: string) => {
    if (!selectedRequest) return;
    updateStatusMutation.mutate({
      requestId: selectedRequest._id,
      requestStatus: status
    });
  };

  // Filter requests
  const filteredRequests = requests.filter((r: any) => {
    let matchesStatus = true;
    if (statusFilter === 'MY_REVIEW') {
      matchesStatus =
        (r.requestStatus === 'PENDING_REVIEW' || !r.requestStatus) &&
        (isSuperOrOrgAdmin || r.teamLeadId?._id === currentUserId || r.teamLeadId === currentUserId);
    } else if (statusFilter === 'MY_REQUESTS') {
      matchesStatus = r.reporterId?._id === currentUserId || r.reporterId === currentUserId;
    } else if (statusFilter !== 'ALL') {
      matchesStatus = (r.requestStatus || 'PENDING_REVIEW') === statusFilter;
    }

    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      r.title?.toLowerCase().includes(query) ||
      r.key?.toLowerCase().includes(query) ||
      r.reporterId?.name?.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string = 'PENDING_REVIEW') => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Accepted
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" /> In Progress
          </span>
        );
      case 'COMPLETED':
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <CheckCircle2 className="w-3 h-3 text-purple-600" /> Completed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" /> Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" /> Pending Review
          </span>
        );
    }
  };

  const getRequestTypeBadge = (req: any) => {
    const type = req.requestType || (req.formId?.title?.toLowerCase().includes('bug') ? 'BUG' : 'OTHER');
    if (type === 'BUG' || req.issueType === 'BUG') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
          <Bug className="w-3 h-3 text-rose-600" /> Bug
        </span>
      );
    } else if (type === 'REQUEST_TO_WORK' || type === 'DEPENDENCY_REQUEST') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
          <Briefcase className="w-3 h-3 text-blue-600" /> Dependency Request
        </span>
      );
    } else if (type === 'REQUEST_HELP' || type === 'TASK_ASSISTANCE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
          <HelpCircle className="w-3 h-3 text-amber-600" /> Task Assistance
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
        {req.formId?.title || 'Request'}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" />
        <p className="text-xs font-semibold">Loading requests...</p>
      </div>
    );
  }

  const pendingReviewCount = requests.filter(
    (r: any) =>
      (!r.requestStatus || r.requestStatus === 'PENDING_REVIEW') &&
      (isSuperOrOrgAdmin || r.teamLeadId?._id === currentUserId || r.teamLeadId === currentUserId)
  ).length;

  return (
    <div className="flex flex-col gap-4 text-[#111827] max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Requests & Intake Inbox</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review, accept, or reject incoming requests. Approved work assignments and help requests link directly to project tasks.
            </p>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({requests.length})
          </button>

          {(canActAsLead || isSuperOrOrgAdmin) && (
            <button
              onClick={() => setStatusFilter('MY_REVIEW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'MY_REVIEW'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Pending My Review</span>
              {pendingReviewCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white text-amber-800 font-extrabold">
                  {pendingReviewCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => setStatusFilter('MY_REQUESTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              statusFilter === 'MY_REQUESTS'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            My Submissions
          </button>

          {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Left Feed, Right Inspection & Actions */}
      <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-240px)]">
        {/* LEFT REQUESTS FEED */}
        <div className="w-full lg:w-96 bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shrink-0 shadow-xs">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search requests or submitter..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all font-medium"
            />
          </div>

          {/* Requests List */}
          <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
            {filteredRequests.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">No requests found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Submissions through predefined forms will appear here.
                </p>
              </div>
            ) : (
              filteredRequests.map((r: any) => {
                const isSelected = selectedRequest?._id === r._id;
                return (
                  <div
                    key={r._id}
                    onClick={() => setSelectedRequestId(r._id)}
                    className={`group p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2.5 ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-100/70 px-1.5 py-0.5 rounded">
                          {r.key}
                        </span>
                        {getRequestTypeBadge(r)}
                      </div>
                      <div className="flex items-center gap-1">
                        {getStatusBadge(r.requestStatus)}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRequestId(r._id);
                            setIsDeleteModalOpen(true);
                          }}
                          title="Move Request to Recycle Bin (30-day retention)"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                      {r.title}
                    </h4>

                    {/* Linked task indicator */}
                    {(r.createdTaskId || r.relatedTaskId) && (
                      <div className="text-[10px] text-slate-500 bg-slate-100/80 px-2 py-1 rounded-md font-medium truncate flex items-center gap-1.5">
                        <span className="text-slate-400">Task:</span>
                        <strong className="text-slate-800 font-mono">{(r.createdTaskId || r.relatedTaskId).key}</strong>
                        <span className="text-slate-400 truncate">- {(r.createdTaskId || r.relatedTaskId).title}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[9px] font-bold uppercase shrink-0">
                          {r.reporterId?.name?.charAt(0) || 'U'}
                        </span>
                        <span className="truncate">{r.reporterId?.name || 'User'}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {r.teamLeadId && (
                          <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[80px]">
                            Lead: {r.teamLeadId?.name?.split(' ')[0] || 'Lead'}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px]">
                          <MessageSquare className="w-3 h-3" /> {r.comments?.length || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT DETAIL & REVIEW DRAWER */}
        {selectedRequest ? (
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col gap-6 overflow-y-auto">
            {/* Top Detail Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex flex-col gap-2 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-blue-600 bg-blue-100/70 px-2 py-0.5 rounded">
                    {selectedRequest.key}
                  </span>
                  {getRequestTypeBadge(selectedRequest)}
                  {getStatusBadge(selectedRequest.requestStatus)}
                </div>

                <h3 className="text-lg font-bold text-slate-900">{selectedRequest.title}</h3>

                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap pt-0.5">
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-400">Reporter:</span>
                    <strong>{selectedRequest.reporterId?.name || 'User'}</strong>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-400">Target Team Lead:</span>
                    <strong>{selectedRequest.teamLeadId?.name || 'Team Lead'}</strong>
                  </span>
                  {selectedRequest.acceptedBy && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-slate-400">Accepted by:</span>
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px]">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {typeof selectedRequest.acceptedBy === 'object' ? selectedRequest.acceptedBy.name : 'Lead'}
                        </span>
                      </span>
                    </>
                  )}
                  <span>•</span>
                  <span className="text-slate-400">{new Date(selectedRequest.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {/* ACTION BUTTONS (Restricted to Team Lead & Admins) */}
              <div className="flex items-center gap-2 flex-wrap">
                {canActAsLead ? (
                  <>
                    {/* Pending Review State: 3 Team Lead Actions */}
                    {(!selectedRequest.requestStatus || selectedRequest.requestStatus === 'PENDING_REVIEW') && (
                      <>
                        {/* Action 1: Direct Resolve */}
                        <button
                          onClick={() => setIsResolveDirectModalOpen(true)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                          title="Resolve directly with notes without board clutter"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>1. Direct Resolve</span>
                        </button>

                        {/* Action 2: Accept & Create Board Task */}
                        <button
                          onClick={() => handleOpenAcceptModal('IN_PROGRESS')}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                          title="Assign member & sprint and create board task"
                        >
                          <Plus className="w-4 h-4" />
                          <span>2. Accept & Create Task</span>
                        </button>

                        {/* Action 3: Reject */}
                        <button
                          onClick={() => setIsRejectModalOpen(true)}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95"
                          title="Reject this request"
                        >
                          <X className="w-4 h-4" />
                          <span>3. Reject</span>
                        </button>
                      </>
                    )}

                    {/* Accepted State */}
                    {selectedRequest.requestStatus === 'ACCEPTED' && (
                      <>
                        <button
                          onClick={() => handleQuickStatusChange('IN_PROGRESS')}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Move to In Progress</span>
                        </button>

                        <button
                          onClick={() => handleQuickStatusChange('COMPLETED')}
                          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark Completed</span>
                        </button>

                        <button
                          onClick={() => setIsRejectModalOpen(true)}
                          className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}

                    {/* In Progress State */}
                    {selectedRequest.requestStatus === 'IN_PROGRESS' && (
                      <>
                        <button
                          onClick={() => handleQuickStatusChange('COMPLETED')}
                          className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Mark as Completed</span>
                        </button>

                        <button
                          onClick={() => handleOpenAcceptModal('IN_PROGRESS')}
                          className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Reassign</span>
                        </button>
                      </>
                    )}

                    {/* Completed / Rejected State */}
                    {(selectedRequest.requestStatus === 'COMPLETED' || selectedRequest.requestStatus === 'REJECTED') && (
                      <button
                        onClick={() => handleQuickStatusChange('PENDING_REVIEW')}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reopen for Review</span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
                    <ShieldCheck className="w-4 h-4 text-slate-400" />
                    <span>Review by Lead: {selectedRequest.teamLeadId?.name || 'Assigned Lead'}</span>
                  </div>
                )}

                {/* Move Request to Recycle Bin */}
                {canDeleteRequest && (
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(true)}
                    title="Move Request to Recycle Bin (30-day retention)"
                    className="flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* CREATED BOARD TASK BANNER (If Team Lead created an actionable board task from this request) */}
            {selectedRequest.createdTaskId && (
              <div className="bg-gradient-to-r from-emerald-50/90 via-emerald-50/40 to-teal-50/60 border border-emerald-200/90 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5 shadow-xs transition-all hover:border-emerald-300">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs ring-2 ring-emerald-200/60">
                    <Kanban className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200/80 px-2.5 py-0.5 rounded-lg tracking-wider shrink-0">
                        {selectedRequest.createdTaskId.key || 'TASK'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined' && (window as any).__openTaskDetails) {
                            (window as any).__openTaskDetails(selectedRequest.createdTaskId);
                          }
                        }}
                        className="text-sm font-bold text-slate-900 hover:text-emerald-700 transition-colors truncate text-left cursor-pointer flex items-center gap-1 group"
                        title="Click to view task details"
                      >
                        <span className="truncate">{selectedRequest.createdTaskId.title || 'Board Task'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </button>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 border shrink-0 ${
                        selectedRequest.createdTaskId.status === 'DONE'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedRequest.createdTaskId.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          selectedRequest.createdTaskId.status === 'DONE' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`} />
                        {selectedRequest.createdTaskId.status}
                      </span>
                    </div>

                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 mt-1.5 font-medium">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Active Board Task
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>
                        Priority:{' '}
                        <span className={`font-semibold ${
                          selectedRequest.createdTaskId.priority === 'URGENT' || selectedRequest.createdTaskId.priority === 'HIGH'
                            ? 'text-rose-600'
                            : selectedRequest.createdTaskId.priority === 'MEDIUM'
                            ? 'text-amber-600'
                            : 'text-emerald-700'
                        }`}>
                          {selectedRequest.createdTaskId.priority || 'MEDIUM'}
                        </span>
                      </span>
                      {selectedRequest.createdTaskId.assigneeId && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-600 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {selectedRequest.createdTaskId.assigneeId.name || 'Assigned'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0 pt-2 sm:pt-0">
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-800 bg-white/95 border border-emerald-200/90 px-3 py-1.5 rounded-xl font-semibold shadow-2xs">
                    <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-500/20" />
                    <span>Auto-completes when task reaches DONE</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && (window as any).__openTaskDetails) {
                        (window as any).__openTaskDetails(selectedRequest.createdTaskId);
                      }
                    }}
                    className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100/70 rounded-lg transition-colors cursor-pointer border border-emerald-200/60"
                    title="Open Task Details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* LINKED TASK BANNER (If this request relates to a task) */}
            {selectedRequest.relatedTaskId && (
              <div className="bg-gradient-to-r from-blue-50/90 via-blue-50/40 to-indigo-50/60 border border-blue-200/90 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3.5 shadow-xs transition-all hover:border-blue-300">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs ring-2 ring-blue-200/60">
                    <Kanban className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="font-mono text-xs font-bold text-blue-800 bg-blue-100/90 border border-blue-200/80 px-2.5 py-0.5 rounded-lg tracking-wider shrink-0">
                        {selectedRequest.relatedTaskId.key || 'TASK'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined' && (window as any).__openTaskDetails) {
                            (window as any).__openTaskDetails(selectedRequest.relatedTaskId);
                          }
                        }}
                        className="text-sm font-bold text-slate-900 hover:text-blue-700 transition-colors truncate text-left cursor-pointer flex items-center gap-1 group"
                        title="Click to view task details"
                      >
                        <span className="truncate">{selectedRequest.relatedTaskId.title || 'Linked Task'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </button>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 border shrink-0 ${
                        selectedRequest.relatedTaskId.status === 'DONE'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : selectedRequest.relatedTaskId.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          selectedRequest.relatedTaskId.status === 'DONE' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`} />
                        {selectedRequest.relatedTaskId.status}
                      </span>
                    </div>

                    <div className="flex items-center flex-wrap gap-2 text-[11px] text-slate-500 mt-1.5 font-medium">
                      <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        Linked Project Task
                      </span>
                      <span className="text-slate-300">•</span>
                      <span>
                        Priority:{' '}
                        <span className={`font-semibold ${
                          selectedRequest.relatedTaskId.priority === 'URGENT' || selectedRequest.relatedTaskId.priority === 'HIGH'
                            ? 'text-rose-600'
                            : selectedRequest.relatedTaskId.priority === 'MEDIUM'
                            ? 'text-amber-600'
                            : 'text-blue-700'
                        }`}>
                          {selectedRequest.relatedTaskId.priority || 'MEDIUM'}
                        </span>
                      </span>
                      {selectedRequest.relatedTaskId.assigneeId && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-600 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {selectedRequest.relatedTaskId.assigneeId.name || 'Assigned'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto shrink-0 pt-2 sm:pt-0">
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-blue-800 bg-white/95 border border-blue-200/90 px-3 py-1.5 rounded-xl font-semibold shadow-2xs">
                    <Zap className="w-3.5 h-3.5 text-blue-600 fill-blue-500/20" />
                    <span>Auto-syncs with task progression</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && (window as any).__openTaskDetails) {
                        (window as any).__openTaskDetails(selectedRequest.relatedTaskId);
                      }
                    }}
                    className="p-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-100/70 rounded-lg transition-colors cursor-pointer border border-blue-200/60"
                    title="Open Task Details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Submitted Form Details & Custom Fields */}
            <div className="flex flex-col gap-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Submitted Request Details
              </h4>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200/80 flex flex-col gap-4">
                {selectedRequest.description && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase">Overview & Notes</label>
                    <p className="text-xs text-slate-800 mt-1 whitespace-pre-wrap leading-relaxed font-medium">
                      {selectedRequest.description}
                    </p>
                  </div>
                )}

                {/* Custom Fields Key-Value Pairs */}
                {selectedRequest.customFields && Object.keys(selectedRequest.customFields).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200">
                    {Object.entries(selectedRequest.customFields).map(([k, v]: [string, any]) => (
                      <div key={k} className="p-3 bg-white border border-slate-200 rounded-xl">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {k}
                        </span>
                        <span className="text-xs font-semibold text-slate-800 mt-0.5 block">
                          {Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Discussion & Review Comments Feed (Available to all team members & lead) */}
            <div className="flex flex-col gap-4 pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>Discussion & Lead Notes ({selectedRequest.comments?.length || 0})</span>
              </h4>

              {/* Comment Thread */}
              <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-1">
                {(selectedRequest.comments || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No comments yet. Leave feedback or response to this request below.
                  </p>
                ) : (
                  selectedRequest.comments.map((c: any) => (
                    <div key={c._id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
                      <span className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center uppercase shrink-0">
                        {c.userId?.name?.charAt(0) || 'U'}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">
                            {c.userId?.name || 'Reviewer'}
                            {c.userId?.role && (
                              <span className="ml-1.5 text-[10px] text-slate-400 font-semibold">
                                [{c.userId.role.replace(/_/g, ' ')}]
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Input */}
              <form onSubmit={handleSendComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Write a message or reply on this request..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-blue-500 font-medium"
                />
                <button
                  type="submit"
                  disabled={!newCommentText.trim() || addCommentMutation.isPending}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 flex flex-col items-center justify-center">
            <Inbox className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-bold text-slate-700">Select a request to inspect</p>
            <p className="text-xs text-slate-400 mt-1">
              Team Leads can approve, assign, or reject requests and collaborate with members.
            </p>
          </div>
        )}
      </div>

      {/* ACCEPT & ASSIGN MODAL (Centered dialog matching TaskModal style) */}
      {isAcceptModalOpen && selectedRequest && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden text-[#111827] w-full max-w-3xl max-h-[90vh] my-auto">
            {/* Top Header Bar */}
            <div className="px-6 py-3.5 border-b border-gray-200 flex items-center justify-between bg-[#F8FAFC] select-none shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-gray-200 font-mono font-bold text-xs text-[#111827] shadow-2xs">
                  <Plus className="w-3.5 h-3.5 text-blue-600" />
                  <span>CONVERT TO BOARD TASK • {selectedRequest.key}</span>
                </div>
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  {acceptTargetStatus === 'IN_PROGRESS' ? 'Start Work' : 'Accept & Plan'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAcceptModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleConfirmAcceptance} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col gap-6">
                {/* Request Headline Card */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Request Title & Origin
                  </label>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{selectedRequest.title}</span>
                      {getRequestTypeBadge(selectedRequest)}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
                      <span>Submitted by <strong>{selectedRequest.reporterId?.name || 'Requester'}</strong></span>
                      <span>•</span>
                      <span>{new Date(selectedRequest.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Special notice for Dependency Request */}
                {(selectedRequest.requestType === 'REQUEST_TO_WORK' || selectedRequest.requestType === 'DEPENDENCY_REQUEST') && selectedRequest.relatedTaskId && (
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-semibold flex items-center gap-2.5">
                    <Briefcase className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      Approving this request will automatically assign target task{' '}
                      <strong>[{selectedRequest.relatedTaskId.key}]</strong> to{' '}
                      <strong>{selectedRequest.reporterId?.name || 'the requester'}</strong>.
                    </span>
                  </div>
                )}

                {/* 2-Column Responsive Grid: Assignee & Sprint */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Assignee Selector */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800">
                        Assignee (Task Owner)
                      </label>
                      {selectedRequest.reporterId && (
                        <button
                          type="button"
                          onClick={() => setSelectedAssignee(selectedRequest.reporterId?._id || selectedRequest.reporterId)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          Assign to Requester
                        </button>
                      )}
                    </div>
                    <select
                      value={selectedAssignee}
                      onChange={(e) => setSelectedAssignee(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="unassigned">Unassigned</option>
                      {selectedRequest.reporterId && (
                        <option value={selectedRequest.reporterId?._id || selectedRequest.reporterId}>
                          ★ {selectedRequest.reporterId?.name} (Requester)
                        </option>
                      )}
                      {members.map((m: any) => {
                        const id = typeof m.userId === 'object' && m.userId?._id ? m.userId._id : m.userId || m._id;
                        const name = m.name || (typeof m.userId === 'object' && m.userId?.name) || m.email?.split('@')[0] || 'Member';
                        return (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Sprint Destination */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      Sprint Destination
                    </label>
                    <select
                      value={selectedSprintId}
                      onChange={(e) => setSelectedSprintId(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-semibold outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="backlog">Product Backlog (No active sprint)</option>
                      {sprints.map((s: any) => (
                        <option key={s._id} value={s._id}>
                          {s.name} {s.status === 'ACTIVE' ? '⭐ (Active Sprint)' : `(${s.status})`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Priority Selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Priority Level
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => {
                      const isSel = selectedPriority === p;
                      const activeColor =
                        p === 'CRITICAL'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : p === 'HIGH'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : p === 'MEDIUM'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-emerald-600 text-white border-emerald-600';
                      return (
                        <button
                          type="button"
                          key={p}
                          onClick={() => setSelectedPriority(p)}
                          className={`py-2.5 text-xs font-extrabold rounded-xl border transition-all cursor-pointer ${
                            isSel ? `${activeColor} shadow-xs scale-100` : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lead Acceptance Note */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Team Lead Resolution Note (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Approved. Assigned to you for Sprint 1 board execution..."
                    value={acceptanceNote}
                    onChange={(e) => setAcceptanceNote(e.target.value)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none font-medium"
                  />
                </div>
              </div>

              {/* Sticky Footer Action Bar */}
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAcceptModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateStatusMutation.isPending}
                  className="px-6 py-2.5 text-xs font-extrabold text-white rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50"
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  <span>Create Board Task & Start Work</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* DIRECT RESOLVE MODAL (Action 1: Resolve Directly without board clutter) */}
      {isResolveDirectModalOpen && selectedRequest && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-lg w-full p-6 flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">Directly Resolve Request</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsResolveDirectModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Resolve request <strong>[{selectedRequest.key}]</strong> immediately with guidance or answers without creating a board task. This marks the request <strong>COMPLETED</strong>.
            </p>

            <form onSubmit={handleConfirmResolveDirect} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Resolution Notes / Answer (Required)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Issue answered, instructions provided, or already addressed in recent update..."
                  value={resolveDirectNote}
                  onChange={(e) => setResolveDirectNote(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white transition-all resize-none font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsResolveDirectModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!resolveDirectNote.trim() || updateStatusMutation.isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Mark as Completed</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* REJECT MODAL */}
      {isRejectModalOpen && selectedRequest && isMounted && createPortal(
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-lg w-full p-6 flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-slate-900">Reject Request</h3>
              </div>
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Are you sure you want to reject request <strong>[{selectedRequest.key}]</strong>? Please provide a reason to help the requester understand.
            </p>

            <form onSubmit={handleConfirmRejection} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Reason for Rejection
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. This is already being handled in Sprint 2, or not needed at this stage..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:border-rose-500 focus:bg-white transition-all resize-none font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!rejectionReason.trim() || updateStatusMutation.isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {updateStatusMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Request Modal */}
      {isDeleteModalOpen && selectedRequest && isMounted && createPortal(
        <DeleteConfirmModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={() => deleteRequestMutation.mutateAsync(selectedRequest._id)}
          title="Move Request to Recycle Bin?"
          itemName={`${selectedRequest.key ? `[${selectedRequest.key}] ` : ''}${selectedRequest.title}`}
          itemType="Request"
          isLoading={deleteRequestMutation.isPending}
        />,
        document.body
      )}
    </div>
  );
};
