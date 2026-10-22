'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { StatCardSkeleton } from './Skeletons';
import {
  Users,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Search,
  Lock,
  UserCheck,
  UserX,
  Sparkles,
  FolderKanban,
  Mail,
  Copy,
  Check,
  UserPlus,
  X,
  Loader2,
  Send,
  Shield,
  ChevronDown,
  Info,
  Plus,
  Eye,
  RotateCw,
  Trash2,
  Calendar,
  AlertCircle
} from 'lucide-react';

import { useAuthStore } from '../store/authStore';
import { UserDetailsModal } from './UserDetailsModal';
import { InviteModal } from './InviteModal';

export const AdminPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, currentWorkspace } = useAuthStore();
  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER';
  const canAccess = isOrgAdmin || isPM;

  const [directoryTab, setDirectoryTab] = useState<'members' | 'invites'>('members');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [selectedUserIdForDetails, setSelectedUserIdForDetails] = useState<string | null>(null);

  // Invite Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentId, setResentId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Fetch Workspace Roles for Dynamic Role Assignment
  const { data: orgRoles = [] } = useQuery({
    queryKey: ['workspace-roles', currentWorkspace?._id],
    queryFn: async () => {
      const res = await api.get(`/auth/admin/roles?workspaceId=${currentWorkspace?._id}`);
      return res.data?.data || [];
    },
    enabled: !!(isOrgAdmin || isPM) && !!currentWorkspace?._id
  });

  // Fetch Organization System Stats
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats', currentWorkspace?._id],
    queryFn: async () => {
      const res = await api.get(`/admin/stats?workspaceId=${currentWorkspace?._id}`);
      return res.data.data;
    },
    enabled: !!canAccess && !!currentWorkspace?._id
  });

  // Fetch Members & Invited Users (Scoped to PM's projects if PM)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', currentWorkspace?._id, search, roleFilter, statusFilter],
    queryFn: async () => {
      let url = `/admin/users?workspaceId=${currentWorkspace?._id}&limit=100`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (roleFilter) url += `&role=${roleFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await api.get(url);
      return res.data;
    },
    enabled: !!canAccess && !!currentWorkspace?._id
  });

  // Registered Active/Suspended Members
  const membersList = useMemo(() => {
    if (usersData?.members) return usersData.members;
    return (usersData?.data || []).filter((u: any) => !u.isPendingInvite);
  }, [usersData]);

  // Pending Invitations
  const pendingInvitesList = useMemo(() => {
    if (usersData?.pendingInvites) return usersData.pendingInvites;
    return (usersData?.data || []).filter((u: any) => u.isPendingInvite);
  }, [usersData]);

  // User Status Toggle Mutation
  const statusMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const res = await api.patch(`/admin/users/${userId}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    }
  });

  // User Role Mutation
  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await api.patch(`/admin/users/${userId}/role`, { role });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  // Resend Invite Mutation
  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      setResendingId(inviteId);
      const res = await api.post(`/invites/${inviteId}/resend`);
      return { inviteId, data: res.data };
    },
    onSuccess: (result) => {
      setResendingId(null);
      setResentId(result.inviteId);
      setTimeout(() => setResentId(null), 3000);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: () => {
      setResendingId(null);
    }
  });

  // Revoke Invite Mutation
  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      setRevokingId(inviteId);
      const res = await api.delete(`/invites/${inviteId}`);
      return { inviteId, data: res.data };
    },
    onSuccess: () => {
      setRevokingId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: () => {
      setRevokingId(null);
    }
  });

  const handleCopyLink = (tokenOrUrl: string) => {
    const inviteUrl = tokenOrUrl.startsWith('http')
      ? tokenOrUrl
      : `${window.location.origin}/invite/${tokenOrUrl}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(tokenOrUrl);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const formatExpiry = (expiresAt: string) => {
    if (!expiresAt) return '7 days';
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Expires today';
    return `Expires in ${diffDays}d`;
  };

  return (
    <div className="flex flex-col gap-6 select-none animate-slide-up text-[#111827]">
      {/* Global Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <div
              onClick={() => setDirectoryTab('members')}
              className={`p-5 bg-white/95 backdrop-blur-md border rounded-2xl shadow-xs cursor-pointer transition-all ${
                directoryTab === 'members'
                  ? 'border-blue-500/40 ring-2 ring-blue-500/10'
                  : 'border-[#0F172A]/10 hover:border-[#0F172A]/20'
              }`}
            >
              <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
                <span>Active Members</span>
                <Users className="w-4.5 h-4.5 text-[#0F172A]" />
              </div>
              <div className="text-3xl font-black text-[#111827] mt-2">
                {membersList.length}
              </div>
              <div className="text-xs text-[#22C55E] font-bold mt-1">
                {`${statsData?.activeUsers || membersList.length} organization members`}
              </div>
            </div>

            <div className="p-5 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
              <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
                <span>{isOrgAdmin ? 'Active Projects' : 'Your Projects'}</span>
                <FolderKanban className="w-4.5 h-4.5 text-[#0F172A]" />
              </div>
              <div className="text-3xl font-black text-[#111827] mt-2">
                {statsData?.totalProjects || 0}
              </div>
              <div className="text-xs text-slate-500 font-semibold mt-1">
                {isOrgAdmin ? 'Projects in this workspace' : 'Projects under your scope'}
              </div>
            </div>

            <div className="p-5 bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl shadow-xs">
              <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
                <span>Total Project Tasks</span>
                <Layers className="w-4.5 h-4.5 text-[#22C55E]" />
              </div>
              <div className="text-3xl font-black text-[#111827] mt-2">
                {statsData?.totalTasks || 0}
              </div>
              <div className="text-xs text-[#0F172A] font-bold mt-1">
                Indexed engineering issues
              </div>
            </div>

            <div
              onClick={() => setDirectoryTab('invites')}
              className={`p-5 bg-white/95 backdrop-blur-md border rounded-2xl shadow-xs cursor-pointer transition-all ${
                directoryTab === 'invites'
                  ? 'border-amber-500/50 ring-2 ring-amber-500/10'
                  : 'border-[#0F172A]/10 hover:border-[#0F172A]/20'
              }`}
            >
              <div className="flex items-center justify-between text-[#111827]/70 text-xs font-bold">
                <span>Pending Invitations</span>
                <UserPlus className="w-4.5 h-4.5 text-[#F59E0B]" />
              </div>
              <div className="text-3xl font-black text-[#111827] mt-2">
                {pendingInvitesList.length}
              </div>
              <div className="text-xs text-[#F59E0B] font-bold mt-1">
                Awaiting token acceptance
              </div>
            </div>
          </>
        )}
      </div>

      {/* User Directory & Management */}
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-[#0F172A]/10 p-6 shadow-xs">
        {/* Header with Tabs and Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#0F172A]/10 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDirectoryTab('members')}
                className={`text-sm sm:text-base font-black pb-1 transition-all cursor-pointer flex items-center gap-2 ${
                  directoryTab === 'members'
                    ? 'text-[#111827] border-b-2 border-[#0F172A]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>Active Members</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  directoryTab === 'members'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {membersList.length}
                </span>
              </button>

              <button
                onClick={() => setDirectoryTab('invites')}
                className={`text-sm sm:text-base font-black pb-1 transition-all cursor-pointer flex items-center gap-2 ${
                  directoryTab === 'invites'
                    ? 'text-[#111827] border-b-2 border-[#0F172A]'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>Pending Invitations</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  directoryTab === 'invites'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {pendingInvitesList.length}
                </span>
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {directoryTab === 'members'
                ? 'Registered active members who have accepted their invitation and have access to workspace resources.'
                : 'Invitations awaiting user acceptance. Pending invitees do not appear as active members until accepted.'}
            </p>
          </div>

          {/* Filters & Action */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={directoryTab === 'members' ? 'Search member name or email...' : 'Search invite email...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs sm:text-sm bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-semibold text-[#111827]"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="text-xs sm:text-sm bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl px-3 py-2 outline-none font-semibold text-[#111827]"
            >
              <option value="">All Roles</option>
              <option value="ORG_ADMIN">Admin (Org Admin)</option>
              <option value="PROJECT_MANAGER">Project Manager (PM)</option>
              <option value="TEAM_LEAD">Team Lead (Lead)</option>
              <option value="HARDWARE">Hardware (Hardware Engineer)</option>
              <option value="FIRMWARE">Firmware (Firmware Engineer)</option>
              <option value="PCB_DESIGNER">PCB (PCB Designer)</option>
              <option value="DEVELOPER">Developer (Frontend / Backend)</option>
              <option value="QA">QA (Testing / Quality)</option>
              <option value="CLOUD">Cloud (DevOps / Infra)</option>
              <option value="DESIGNER">Designer (UI / UX)</option>
              <option value="MEMBER">Member (Staff / Contributor)</option>
              <option value="GUEST">Guest (Viewer)</option>
            </select>

            {(isOrgAdmin || isPM) && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white bg-[#22C55E] hover:bg-[#16A34A] px-4 py-2 rounded-xl transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Invite Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Active Registered Members Table */}
        {directoryTab === 'members' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#0F172A]/10 text-xs font-extrabold text-[#111827]/70 uppercase tracking-wider bg-[#F3F4F6]/70">
                  <th className="py-3.5 px-4 rounded-l-xl">Member Name & Email</th>
                  <th className="py-3.5 px-4">Role & Specialization</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 rounded-r-xl text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F172A]/5 text-xs sm:text-sm">
                {membersList.map((u: any) => (
                  <tr key={u._id} className="hover:bg-[#F3F4F6]/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-white bg-[#0F172A]">
                          {u.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div className="font-bold text-[#111827] text-sm">
                            {u.name}
                          </div>
                          <div className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span>{u.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4">
                      {isOrgAdmin ? (
                        <select
                          value={u.role || 'MEMBER'}
                          onChange={(e) =>
                            roleMutation.mutate({
                              userId: u._id,
                              role: e.target.value
                            })
                          }
                          className="bg-[#F3F4F6] hover:bg-white focus:bg-white border border-[#0F172A]/10 focus:border-[#0F172A] font-semibold text-xs rounded-lg px-3 py-1.5 outline-none text-[#111827] transition-colors"
                        >
                          {orgRoles.length > 0 ? (
                            orgRoles.map((r: any) => (
                              <option key={r.key} value={r.key}>
                                {r.name} ({r.key})
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="ORG_ADMIN">Admin (Org Admin)</option>
                              <option value="MEMBER">Member (Contributor)</option>
                            </>
                          )}
                        </select>
                      ) : (
                        <span className="font-bold text-xs text-[#0F172A] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
                          {u.role || 'MEMBER'}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                          u.status === 'ACTIVE'
                            ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
                            : u.status === 'SUSPENDED'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-[#F3F4F6] text-[#111827]/70 border-[#0F172A]/10'
                        }`}
                      >
                        {u.status || 'ACTIVE'}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedUserIdForDetails(u._id)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F172A] hover:bg-[#0F172A] hover:text-white bg-[#F3F4F6] border border-[#0F172A]/10 px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-2xs hover:shadow-sm"
                          title="View In-Depth Profile, Teams & Tasks"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        {isOrgAdmin && u.status === 'ACTIVE' ? (
                          <button
                            onClick={() => statusMutation.mutate({ userId: u._id, status: 'SUSPENDED' })}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Suspend
                          </button>
                        ) : isOrgAdmin ? (
                          <button
                            onClick={() => statusMutation.mutate({ userId: u._id, status: 'ACTIVE' })}
                            className="text-xs font-bold text-[#22C55E] hover:text-[#22C55E]/90 bg-[#22C55E]/10 hover:bg-[#22C55E]/20 border border-[#22C55E]/30 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                          >
                            Activate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}

                {membersList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-[#111827]/40">
                      No active members found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Pending Invitations Table */}
        {directoryTab === 'invites' && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#0F172A]/10 text-xs font-extrabold text-[#111827]/70 uppercase tracking-wider bg-[#F3F4F6]/70">
                  <th className="py-3.5 px-4 rounded-l-xl">Invitee Email</th>
                  <th className="py-3.5 px-4">Invited Role</th>
                  <th className="py-3.5 px-4">Assigned Scope</th>
                  <th className="py-3.5 px-4">Invited By & Expiry</th>
                  <th className="py-3.5 px-4 rounded-r-xl text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F172A]/5 text-xs sm:text-sm">
                {pendingInvitesList.map((inv: any) => {
                  const inviteId = inv.inviteId || inv._id;
                  const isThisResending = resendingId === inviteId;
                  const isThisResent = resentId === inviteId;
                  const isThisRevoking = revokingId === inviteId;

                  return (
                    <tr key={inv._id} className="hover:bg-[#F3F4F6]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-amber-700 bg-amber-100 border border-amber-300">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-[#111827] text-sm flex items-center gap-2">
                              <span>{inv.email}</span>
                              <span className="text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                Pending
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 font-medium mt-0.5">
                              Awaiting user registration or acceptance
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Invited Role */}
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-xs text-[#0F172A] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded inline-block">
                          {inv.role || 'MEMBER'}
                        </span>
                      </td>

                      {/* Assigned Scope (Project / Team) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          {inv.assignedProjects && inv.assignedProjects.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50/70 border border-blue-200/60 px-2 py-0.5 rounded w-fit">
                              <FolderKanban className="w-3 h-3 text-blue-600" />
                              <span>{inv.assignedProjects[0].name}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 font-medium">
                              Full Workspace
                            </span>
                          )}

                          {inv.team && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50/70 border border-purple-200/60 px-2 py-0.5 rounded w-fit">
                              <Users className="w-3 h-3 text-purple-600" />
                              <span>Team: {inv.team.name}</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Invited By & Expiry */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-medium text-slate-700">
                          By <strong>{inv.invitedBy || 'Admin'}</strong>
                        </div>
                        <div className="text-[11px] text-amber-600 font-semibold flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{formatExpiry(inv.expiresAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Copy Link */}
                          <button
                            onClick={() => handleCopyLink(inv.inviteToken)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-[#0F172A] hover:bg-[#F3F4F6] bg-white border border-[#0F172A]/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Copy Invitation Link"
                          >
                            {copiedToken === inv.inviteToken ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                                <span className="text-[#22C55E]">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>

                          {/* Resend */}
                          {(isOrgAdmin || isPM) && (
                            <button
                              onClick={() => resendInviteMutation.mutate(inviteId)}
                              disabled={isThisResending}
                              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:bg-blue-100 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Resend invitation & refresh 7-day expiration"
                            >
                              {isThisResending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : isThisResent ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                                  <span className="text-[#22C55E]">Sent!</span>
                                </>
                              ) : (
                                <>
                                  <RotateCw className="w-3.5 h-3.5" />
                                  <span>Resend</span>
                                </>
                              )}
                            </button>
                          )}

                          {/* Revoke */}
                          {(isOrgAdmin || isPM) && (
                            <button
                              onClick={() => {
                                if (confirm(`Revoke invitation for ${inv.email}? This cannot be undone.`)) {
                                  revokeInviteMutation.mutate(inviteId);
                                }
                              }}
                              disabled={isThisRevoking}
                              className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:bg-rose-100 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Revoke and cancel this invitation"
                            >
                              {isThisRevoking ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Revoke</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {pendingInvitesList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-[#111827]/40">
                      No pending invitations at this time.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Standalone Modular Invite Modal */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
        }}
      />

      {/* User In-Depth Details Modal */}
      <UserDetailsModal
        isOpen={!!selectedUserIdForDetails}
        onClose={() => setSelectedUserIdForDetails(null)}
        userId={selectedUserIdForDetails}
        workspaceId={currentWorkspace?._id || ''}
      />
    </div>
  );
};
