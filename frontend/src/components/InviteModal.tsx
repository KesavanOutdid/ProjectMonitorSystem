'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  X,
  UserPlus,
  Mail,
  Copy,
  Check,
  Shield,
  Sparkles,
  Send,
  Building,
  FolderKanban,
  Info,
  Users,
  Search,
  ChevronDown,
  UserCheck,
  Plus,
  Trash2
} from 'lucide-react';

export interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  teamId?: string;
  teamName?: string;
}

interface SelectedRecipient {
  email: string;
  name: string;
  isExisting: boolean;
  role?: string;
  department?: string;
  jobTitle?: string;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  teamId,
  teamName
}) => {
  const queryClient = useQueryClient();
  const { currentWorkspace, currentProject } = useAuthStore();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [selectedRecipients, setSelectedRecipients] = useState<SelectedRecipient[]>([]);
  const [manualEmailInput, setManualEmailInput] = useState('');
  const [defaultRole, setDefaultRole] = useState('DEVELOPER');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || '');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId || '');
  const [memberSearch, setMemberSearch] = useState('');
  const [bulkResult, setBulkResult] = useState<any | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Keep props synchronized
  useEffect(() => {
    if (projectId !== undefined) {
      setSelectedProjectId(projectId || '');
    }
  }, [projectId]);

  useEffect(() => {
    if (teamId !== undefined) {
      setSelectedTeamId(teamId || '');
    }
  }, [teamId]);

  // 1. Fetch all members in the current workspace
  const { data: workspaceMembers = [] } = useQuery({
    queryKey: ['workspace-members-list', currentWorkspace?._id],
    queryFn: async () => {
      if (!currentWorkspace?._id) return [];
      const res = await api.get(`/workspaces/${currentWorkspace._id}/members`);
      return res.data.data || [];
    },
    enabled: isOpen && !!currentWorkspace?._id
  });

  // 2. Fetch all teams in current workspace for optional assignment
  const { data: workspaceTeams = [] } = useQuery({
    queryKey: ['invite-workspace-teams', currentWorkspace?._id],
    queryFn: async () => {
      if (!currentWorkspace?._id) return [];
      const res = await api.get(`/teams?workspaceId=${currentWorkspace._id}`);
      return res.data?.data || [];
    },
    enabled: isOpen && !!currentWorkspace?._id
  });

  // 3. Fetch all projects in current workspace for optional assignment
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['invite-workspace-projects', currentWorkspace?._id],
    queryFn: async () => {
      if (!currentWorkspace?._id) return [];
      const res = await api.get(`/projects?workspaceId=${currentWorkspace._id}`);
      return res.data?.data || [];
    },
    enabled: isOpen && !!currentWorkspace?._id
  });

  // Active project lookup
  const activeProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return (
      workspaceProjects.find((p: any) => p._id === selectedProjectId) ||
      (projectId && projectName ? { _id: projectId, name: projectName } : null) ||
      (selectedProjectId === currentProject?._id ? currentProject : null)
    );
  }, [selectedProjectId, workspaceProjects, projectId, projectName, currentProject]);

  // Dynamic modal header title
  const modalTitle = useMemo(() => {
    if (teamName) return `Invite to Team "${teamName}"`;
    if (activeProject) return `Invite to Project "${activeProject.name}"`;
    return `Invite Members to Organization`;
  }, [teamName, activeProject]);

  // Filtered members by search
  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase().trim();
    return workspaceMembers.filter((m: any) => {
      const matchSearch =
        !q ||
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.jobTitle?.toLowerCase().includes(q) ||
        m.department?.toLowerCase().includes(q);

      return matchSearch;
    });
  }, [workspaceMembers, memberSearch]);

  // Check if member is already selected
  const isSelected = (email: string) => {
    return selectedRecipients.some((r) => r.email.toLowerCase() === email.toLowerCase());
  };

  // Toggle member selection
  const handleToggleMember = (m: any) => {
    const email = (m.email || '').toLowerCase().trim();
    if (!email) return;

    if (isSelected(email)) {
      setSelectedRecipients((prev) => prev.filter((r) => r.email.toLowerCase() !== email));
    } else {
      setSelectedRecipients((prev) => [
        ...prev,
        {
          email,
          name: m.name || email.split('@')[0],
          isExisting: true,
          department: m.department,
          jobTitle: m.jobTitle
        }
      ]);
    }
  };

  // Add manual email recipient
  const handleAddManualEmail = () => {
    const email = manualEmailInput.toLowerCase().trim();
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    if (isSelected(email)) {
      setError('This email is already in the recipient list');
      return;
    }

    setError('');
    const existing = workspaceMembers.find((m: any) => m.email?.toLowerCase() === email);
    setSelectedRecipients((prev) => [
      ...prev,
      {
        email,
        name: existing?.name || email.split('@')[0],
        isExisting: !!existing,
        department: existing?.department,
        jobTitle: existing?.jobTitle
      }
    ]);
    setManualEmailInput('');
  };

  // Select all filtered members
  const handleSelectAll = () => {
    const newItems: SelectedRecipient[] = [];
    filteredMembers.forEach((m: any) => {
      const email = (m.email || '').toLowerCase().trim();
      if (email && !isSelected(email)) {
        newItems.push({
          email,
          name: m.name || email.split('@')[0],
          isExisting: true,
          department: m.department,
          jobTitle: m.jobTitle
        });
      }
    });
    setSelectedRecipients((prev) => [...prev, ...newItems]);
  };

  // Remove recipient
  const handleRemoveRecipient = (email: string) => {
    setSelectedRecipients((prev) => prev.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));
  };

  // Bulk Invite Mutation
  const bulkInviteMutation = useMutation({
    mutationFn: async () => {
      setError('');
      if (selectedRecipients.length === 0) {
        throw new Error('Please enter at least one email address to invite');
      }

      const payload = {
        invites: selectedRecipients.map((r) => ({
          email: r.email,
          role: defaultRole
        })),
        defaultRole,
        workspaceId: currentWorkspace?._id,
        projectId: selectedProjectId || undefined,
        teamId: selectedTeamId || undefined,
        frontendUrl: typeof window !== 'undefined' ? window.location.origin : undefined
      };

      const res = await api.post('/invites/bulk', payload);
      return res.data;
    },
    onSuccess: (data) => {
      const respData = data?.data || {};
      setBulkResult(respData);
      setSelectedRecipients([]);
      queryClient.invalidateQueries({ queryKey: ['project-members'] });
      queryClient.invalidateQueries({ queryKey: ['project-detail'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-members-list'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin-workspace-teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || err.message || 'Failed to send bulk invitations');
    }
  });

  const getNormalizedInviteLink = (rawLink?: string, token?: string) => {
    if (typeof window !== 'undefined') {
      if (token) {
        return `${window.location.origin}/invite/${token}`;
      }
      if (rawLink) {
        try {
          const url = new URL(rawLink);
          return `${window.location.origin}${url.pathname}${url.search}`;
        } catch (_) {
          return rawLink;
        }
      }
    }
    return rawLink || '';
  };

  if (!isOpen || !isMounted) return null;

  const handleCopyLink = (link: string, idx: number) => {
    const normalized = getNormalizedInviteLink(link);
    navigator.clipboard.writeText(normalized);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2500);
  };

  const handleReset = () => {
    setBulkResult(null);
    setSelectedRecipients([]);
    setManualEmailInput('');
    setError('');
    setCopiedIdx(null);
    setSelectedProjectId(projectId || '');
    setSelectedTeamId(teamId || '');
  };

  const resultRecipients = bulkResult?.invitations || bulkResult?.recipients || bulkResult?.invites || [];
  const recipientCount = bulkResult?.count || bulkResult?.allowedEmails?.length || resultRecipients.length || 0;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in select-none">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#0F172A]/10 flex items-center justify-between bg-[#F3F4F6]/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0F172A]/10 border border-[#0F172A]/20 flex items-center justify-center text-[#0F172A]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111827]">
                {modalTitle}
              </h2>
              <p className="text-[11px] text-[#111827]/60">
                {currentWorkspace?.name || 'Organization Workspace'} · Real-Time Member Dispatch
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1 text-[#111827]/50 hover:text-[#111827] rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {error}
            </div>
          )}

          {bulkResult ? (
            /* Results Screen */
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl text-[#111827] text-xs flex flex-col gap-1.5">
                <div className="font-bold flex items-center gap-1.5 text-[#22C55E]">
                  <Check className="w-4 h-4" />
                  Successfully Invited {recipientCount} Member(s)!
                </div>
                <p className="text-[11px] text-[#111827]/70">
                  {selectedProjectId
                    ? `Members have been granted access to project "${activeProject?.name}".`
                    : 'Members have been invited to the organization.'}
                </p>
              </div>

              {/* Master Universal Link */}
              {bulkResult.inviteLink && (
                <div className="bg-[#F8FAFC] border border-[#0F172A]/10 rounded-xl p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#22C55E]" />
                      Universal Invitation Link
                    </span>
                    <span className="text-[10px] text-[#22C55E] bg-[#22C55E]/10 px-2 py-0.5 rounded-full">
                      {recipientCount} Authorized Email(s)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-[#0F172A]/10 rounded-lg p-2">
                    <input
                      readOnly
                      value={getNormalizedInviteLink(bulkResult.inviteLink, bulkResult.token || (resultRecipients[0] as any)?.token)}
                      className="text-xs font-mono text-[#0F172A] bg-transparent outline-none flex-1 truncate"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyLink(bulkResult.inviteLink, -1)}
                      className="text-xs font-bold text-white bg-[#0F172A] hover:bg-slate-800 px-3.5 py-1.5 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors shrink-0 shadow-xs"
                    >
                      {copiedIdx === -1 ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                          <span>Copied Link!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* List of Sent Invites */}
              {resultRecipients.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-gray-700 uppercase">
                    Authorized Invited Members ({resultRecipients.length})
                  </span>
                  <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                    {resultRecipients.map((res: any, idx: number) => {
                      const email = res.email;
                      const name = res.name || email.split('@')[0];
                      const role = res.role || bulkResult.role || defaultRole;
                      const link = getNormalizedInviteLink(res.inviteLink || bulkResult.inviteLink, res.token || bulkResult.token);

                      return (
                        <div
                          key={idx}
                          className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs uppercase">
                              {name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 leading-tight">{name}</p>
                              <p className="text-[11px] text-gray-500">{email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {role}
                            </span>
                            {link && (
                              <button
                                type="button"
                                onClick={() => handleCopyLink(link, idx)}
                                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                                title="Copy Personal Token Link"
                              >
                                {copiedIdx === idx ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all cursor-pointer"
                >
                  Invite More
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleReset();
                    onClose();
                  }}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0F172A] hover:bg-[#1E293B] text-white transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Invite Creation Form */
            <div className="flex flex-col gap-4">
              {/* 1. Add by Email Address */}
              <div>
                <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1.5">
                  Add by Email Address (External or New Staff)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      placeholder="teammate@company.com"
                      value={manualEmailInput}
                      onChange={(e) => setManualEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddManualEmail();
                        }
                      }}
                      className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-medium text-[#111827]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddManualEmail}
                    disabled={!manualEmailInput.trim()}
                    className="px-4 py-2 bg-[#0F172A] hover:bg-slate-800 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* 2. Select Existing Org Members ONLY if Project or Team is assigned */}
              {selectedProjectId ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-[#111827] uppercase tracking-wider">
                      Select Organization Members To Add ({workspaceMembers.length})
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedRecipients([])}
                        className="text-[11px] font-bold text-gray-500 hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Search Bar for Members */}
                  <div className="relative mb-2">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search members by name, email, or department..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-gray-400 text-gray-800"
                    />
                  </div>

                  {/* Member Checkbox Grid */}
                  <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-100 bg-white">
                    {filteredMembers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-gray-400 font-medium">
                        No members matching "{memberSearch}"
                      </div>
                    ) : (
                      filteredMembers.map((m: any) => {
                        const selected = isSelected(m.email);
                        return (
                          <div
                            key={m._id}
                            onClick={() => handleToggleMember(m)}
                            className={`p-2.5 flex items-center justify-between transition-colors cursor-pointer ${
                              selected ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {}}
                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs uppercase">
                                {m.name?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-gray-900 leading-tight">
                                  {m.name}
                                </p>
                                <p className="text-[10px] text-gray-400 font-medium">
                                  {m.email} {m.department ? `· ${m.department}` : ''}
                                </p>
                              </div>
                            </div>

                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                              {m.jobTitle || m.role || 'Member'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-blue-50/60 border border-blue-200/60 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-bold">Organization-Level Invitation:</span>
                    <p className="text-[11px] text-blue-800/80 mt-0.5">
                      Invited members will join the organization. If you want to scope their access to a single specific project or team, select one in the options below.
                    </p>
                  </div>
                </div>
              )}

              {/* 3. Selected Recipients Chips */}
              {selectedRecipients.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-700 uppercase">
                      Queued Recipients ({selectedRecipients.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-200">
                    {selectedRecipients.map((r) => (
                      <span
                        key={r.email}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-gray-800 border border-gray-200 shadow-2xs"
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span>{r.name}</span>
                        <span className="text-gray-400 font-normal text-[10px]">({r.email})</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveRecipient(r.email);
                          }}
                          className="text-gray-400 hover:text-rose-600 rounded-full p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Project, Team & Role Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                {/* Optional Project Assignment */}
                <div>
                  <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1">
                    Assign to Project <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={!!projectId}
                    className="w-full px-3 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none font-medium text-[#111827] disabled:opacity-75 disabled:bg-gray-100"
                  >
                    <option value="">No Project (Organization Level)</option>
                    {workspaceProjects.map((p: any) => (
                      <option key={p._id} value={p._id}>
                        [{p.key}] {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Team Assignment */}
                <div>
                  <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1">
                    Assign to Team <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    disabled={!!teamId}
                    className="w-full px-3 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none font-medium text-[#111827] disabled:opacity-75 disabled:bg-gray-100"
                  >
                    <option value="">No Team (General Member)</option>
                    {workspaceTeams.map((t: any) => (
                      <option key={t._id} value={t._id}>
                        [{t.key}] {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role & Permissions (Spans full width) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1">
                    Role & Permissions
                  </label>
                  <select
                    value={defaultRole}
                    onChange={(e) => setDefaultRole(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none font-medium text-[#111827]"
                  >
                    <option value="DEVELOPER">Developer (Frontend / Backend / Hardware)</option>
                    <option value="QA">QA (Testing / Reliability Validation)</option>
                    <option value="CLOUD">Cloud (DevOps / Infra)</option>
                    <option value="DESIGNER">Designer (UI / UX / CAD)</option>
                    <option value="TEAM_LEAD">Team Lead (Discipline Lead)</option>
                    <option value="PROJECT_MANAGER">Project Manager (PM)</option>
                    <option value="ORG_ADMIN">Admin (Org Admin)</option>
                    <option value="MEMBER">Member (Staff / Contributor)</option>
                    <option value="GUEST">Guest (Viewer)</option>
                  </select>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-[#0F172A]/10">
                <span className="text-xs text-gray-500 font-medium">
                  {selectedRecipients.length === 0
                    ? 'No members queued'
                    : `${selectedRecipients.length} member(s) queued`}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleReset();
                      onClose();
                    }}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => bulkInviteMutation.mutate()}
                    disabled={selectedRecipients.length === 0 || bulkInviteMutation.isPending}
                    className="px-5 py-2 bg-[#0F172A] hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    {bulkInviteMutation.isPending ? (
                      <span>Sending Invites...</span>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Invitation{selectedRecipients.length > 1 ? 's' : ''}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
