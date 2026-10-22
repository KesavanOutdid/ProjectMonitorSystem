'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import api, { setStoredTokens } from '../../../lib/api';
import { useAuthStore } from '../../../store/authStore';
import {
  UserPlus,
  CheckCircle2,
  AlertCircle,
  Lock,
  User,
  Building,
  FolderKanban,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Mail,
  LayoutGrid,
  Globe,
  Users,
  Layers,
  Bell,
  HelpCircle,
  ChevronDown,
  Plus
} from 'lucide-react';

export default function AcceptInvitePage() {
  const params = useParams();
  const token = params?.token as string;
  const router = useRouter();
  const { setUser, setCurrentWorkspace, setCurrentProject, user: currentUser } = useAuthStore();

  const [emailInput, setEmailInput] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [declined, setDeclined] = useState(false);

  // Fetch Invite metadata
  const { data: inviteData, isLoading, isError } = useQuery({
    queryKey: ['invite-detail', token],
    queryFn: async () => {
      const res = await api.get(`/invites/${token}`);
      return res.data.data;
    },
    enabled: !!token,
    retry: false
  });

  // Accept Mutation
  const acceptMutation = useMutation({
    mutationFn: async () => {
      setError('');
      const res = await api.post(`/invites/${token}/accept`, {
        name,
        password,
        comment,
        email: inviteData?.isBatch ? emailInput.trim() : undefined
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (data?.data?.tokens) {
        setStoredTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken, false);
      }
      setUser(data.data.user);
      if (data.data.workspace) {
        setCurrentWorkspace(data.data.workspace);
      }
      if (data.data.project) {
        setCurrentProject({
          _id: data.data.project.id,
          name: data.data.project.name,
          key: data.data.project.key,
          workspaceId: data.data.workspace?.id
        });
      }
      // Directly land inside the workspace dashboard (no login redirect)
      window.location.href = '/';
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to accept invitation');
    }
  });

  // Decline Mutation
  const declineMutation = useMutation({
    mutationFn: async () => {
      setError('');
      const res = await api.post(`/invites/${token}/decline`, {
        comment: comment || 'Declined by user'
      });
      return res.data;
    },
    onSuccess: () => {
      setDeclined(true);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to decline invitation');
    }
  });

  const workspaceName = inviteData?.workspace?.name || 'Workspace';
  const isExisting = inviteData?.isExistingUser;

  return (
    <div className="flex h-screen bg-[#F3F4F6] overflow-hidden select-none text-[#111827]">
      {/* ─── Top Global Navigation Bar ─── */}
      <header className="fixed top-0 left-0 right-0 z-30 h-[53px] bg-white border-b border-gray-200/80 px-4 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] flex items-center justify-center text-white font-black text-xs shadow-sm border border-white/10 relative">
            <span className="text-[#22C55E]">OS</span>
            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#22C55E] ring-2 ring-white" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-black text-[#111827] text-sm">Outdid</span>
            <span className="font-black text-[#22C55E] text-sm -ml-1">Sync</span>
            <span className="text-xs text-gray-300">|</span>
            <span className="text-xs font-bold text-gray-700">{workspaceName}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg relative">
            <Bell className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
            <div className="w-7 h-7 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">
              {currentUser?.name ? currentUser.name[0].toUpperCase() : 'U'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold leading-tight text-gray-900">
                {currentUser?.name || 'Guest User'}
              </span>
              <span className="text-[10px] text-gray-500 font-medium">
                {currentUser?.role ? currentUser.role.replace(/_/g, ' ') : 'Invited Member'}
              </span>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg border border-rose-200 ml-1 transition-colors cursor-pointer"
            >
              {currentUser ? 'Logout' : 'Login'}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main Shell (Sidebar + Background Workspace Content) ─── */}
      <div className="flex flex-1 pt-[53px] h-full overflow-hidden">
        {/* Left Workspace Navigation Sidebar (ALWAYS VISIBLE) */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between h-[calc(100vh-53px)] shrink-0 select-none">
          <div className="p-3 flex flex-col gap-1 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Workspace Nav
              </span>
            </div>

            {/* Dashboard Nav */}
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
              <LayoutGrid className="w-4 h-4 text-slate-500" />
              <span>Dashboard</span>
            </div>

            {/* Spaces / Projects Nav */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-slate-500" />
                <span>Spaces / Projects</span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>

            {/* Recent Spaces */}
            <div className="pt-2 px-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Recent Spaces
              </span>
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-50 cursor-pointer">
                <Plus className="w-3.5 h-3.5 text-slate-400" />
                <span>Create space</span>
              </div>
            </div>

            {/* Organization Nav Group */}
            <div className="pt-3 px-2 border-t border-slate-200 mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Organization
              </span>

              {/* Members & Invites (ACTIVE WITH BLUE DOT) */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-blue-900 bg-blue-50/70 border border-blue-200/60 shadow-2xs cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>Members & Invites</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
              </div>

              {/* Roles & Permissions */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors mt-1 cursor-pointer">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-slate-500" />
                  <span>Roles & Permissions</span>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                  RBAC
                </span>
              </div>

              {/* Teams */}
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors mt-1 cursor-pointer">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Teams</span>
              </div>
            </div>
          </div>

          {/* Footer Status */}
          <div className="p-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 font-semibold">
            <span>Outdid Sync Active</span>
            <span className="font-mono">v1.0</span>
          </div>
        </aside>

        {/* ─── Background Workspace Preview (Behind the Modal) ─── */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#F3F4F6] relative">
          <div className="flex flex-col gap-6 opacity-60 pointer-events-none">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                  <span>Organization Members</span>
                  <Users className="w-4 h-4 text-[#0F172A]" />
                </div>
                <div className="text-3xl font-black text-gray-900 mt-2">1</div>
                <div className="text-xs text-emerald-600 font-bold mt-1">1 active • 1 invited</div>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                  <span>Active Projects</span>
                  <FolderKanban className="w-4 h-4 text-[#0F172A]" />
                </div>
                <div className="text-3xl font-black text-gray-900 mt-2">0</div>
                <div className="text-xs text-gray-400 font-medium mt-1">Projects in workspace</div>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                  <span>Total Project Tasks</span>
                  <Layers className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-3xl font-black text-gray-900 mt-2">0</div>
                <div className="text-xs text-gray-400 font-medium mt-1">Indexed tasks</div>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                  <span>Pending Invitations</span>
                  <UserPlus className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-3xl font-black text-gray-900 mt-2">1</div>
                <div className="text-xs text-amber-600 font-bold mt-1">Awaiting acceptance</div>
              </div>
            </div>

            {/* Table Mockup */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-bold text-gray-900">Organization Members & Invited People</h3>
              <p className="text-xs text-gray-500 mt-0.5">Active collaborators in {workspaceName}</p>
            </div>
          </div>

          {/* ─── Centered Modal Dialog Popup with Backdrop ─── */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#0F172A]/10 overflow-hidden flex flex-col animate-slide-up">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#0F172A] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-[#22C55E]" />
                  <div>
                    <h3 className="font-bold text-sm leading-tight">Accept Workspace Invitation</h3>
                    <p className="text-[11px] text-slate-300">Join {workspaceName} collaboration</p>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto max-h-[80vh]">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center font-black animate-pulse border border-white/10 shadow-md">
                      <span className="text-[#22C55E]">OS</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500">
                      Verifying Outdid Sync invitation link...
                    </span>
                  </div>
                ) : declined ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-6 h-6 text-[#22C55E]" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900">Invitation Declined</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      You have declined the invitation to join {workspaceName}.
                    </p>
                    <button
                      onClick={() => router.push('/login')}
                      className="mt-5 w-full bg-[#0F172A] text-white py-2 rounded-xl text-xs font-bold hover:bg-[#1E293B] transition-colors"
                    >
                      Back to Login
                    </button>
                  </div>
                ) : isError || !inviteData ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 border border-rose-200">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900">Invalid or Expired Invitation</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      This invitation link is invalid, expired, or has already been accepted.
                    </p>
                    <button
                      onClick={() => router.push('/login')}
                      className="mt-5 w-full bg-[#0F172A] text-white py-2 rounded-xl text-xs font-bold hover:bg-[#1E293B] transition-colors"
                    >
                      Go to Login
                    </button>
                  </div>
                ) : inviteData.isAlreadyMemberOfProject ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 border border-emerald-200">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-gray-900">Already an Active Member!</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      You are already an active member of this project ({inviteData.project ? `[${inviteData.project.key}] ${inviteData.project.name}` : workspaceName}).
                    </p>
                    <button
                      onClick={() => router.push('/')}
                      className="mt-5 w-full bg-[#0F172A] text-white py-2.5 rounded-xl text-xs font-bold hover:bg-[#1E293B] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <span>Open Workspace & Project</span>
                      <ArrowRight className="w-4 h-4 text-[#22C55E]" />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Organization & Project Badge */}
                    <div className="p-3.5 bg-[#F8FAFC] border border-slate-200 rounded-xl mb-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <Building className="w-3.5 h-3.5 text-gray-400" />
                        <span>Organization:</span>
                        <strong className="text-gray-900">{workspaceName}</strong>
                      </div>

                      {inviteData.project && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                          <span>Project:</span>
                          <strong className="text-gray-900">
                            [{inviteData.project.key}] {inviteData.project.name}
                          </strong>
                        </div>
                      )}

                      {inviteData.team && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                          <Users className="w-3.5 h-3.5 text-purple-600" />
                          <span>Team:</span>
                          <strong className="text-gray-900">
                            [{inviteData.team.key}] {inviteData.team.name}
                          </strong>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px]">
                        <span className="text-gray-500">
                          Invited by: <strong>{inviteData.inviter?.name || 'Administrator'}</strong>
                        </span>
                        <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                          {inviteData.role}
                        </span>
                      </div>
                    </div>

                    {/* Authenticated user banner */}
                    {inviteData.isLoggedIn && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs">
                          {inviteData.existingUserName?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-blue-900 truncate">
                            Logged in as {inviteData.existingUserName}
                          </div>
                          <div className="text-[11px] text-blue-700 truncate">
                            {inviteData.email} • 1-click Join
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                        {error}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        acceptMutation.mutate();
                      }}
                      className="flex flex-col gap-3"
                    >
                      {/* Email address */}
                      {!inviteData.isLoggedIn && (
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                            Your Email Address {inviteData.isBatch && <span className="text-rose-500">*</span>}
                          </label>
                          {inviteData.isBatch ? (
                            <div>
                              <div className="relative">
                                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                  type="email"
                                  required
                                  placeholder="your.email@company.com"
                                  value={emailInput}
                                  onChange={(e) => setEmailInput(e.target.value)}
                                  className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F3F4F6] border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-medium text-gray-900"
                                />
                              </div>
                              <p className="text-[10px] text-gray-500 mt-1">
                                Enter the invited email address. Only authorized invited emails can accept.
                              </p>
                            </div>
                          ) : (
                            <input
                              type="text"
                              disabled
                              value={inviteData.email}
                              className="w-full px-3.5 py-2 text-xs bg-gray-100 border border-gray-200 rounded-xl text-gray-600 font-medium cursor-not-allowed"
                            />
                          )}
                        </div>
                      )}

                      {/* Brand new user: Name field */}
                      {!isExisting && !inviteData.isLoggedIn && (
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                            Full Name *
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="text"
                              required
                              placeholder="Alex Morgan"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F3F4F6] border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-medium text-gray-900"
                            />
                          </div>
                        </div>
                      )}

                      {/* Password field only needed if not already authenticated */}
                      {!inviteData.isLoggedIn && (
                        <div>
                          <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1">
                            {isExisting ? 'Account Password *' : 'Create Password (min 6 chars) *'}
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                              type="password"
                              required
                              placeholder="••••••••"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#F3F4F6] border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-medium text-gray-900"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          Comment / Note (Optional)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Joining sprint team"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-[#F3F4F6] border border-gray-300 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] font-medium resize-none text-gray-900"
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => declineMutation.mutate()}
                          disabled={declineMutation.isPending || acceptMutation.isPending}
                          className="flex-1 bg-gray-100 hover:bg-rose-50 hover:text-rose-700 text-gray-700 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 border border-transparent hover:border-rose-200"
                        >
                          {declineMutation.isPending ? 'Declining...' : 'Decline / Reject'}
                        </button>

                        <button
                          type="submit"
                          disabled={acceptMutation.isPending || declineMutation.isPending}
                          className="flex-[2] bg-[#0F172A] hover:bg-[#1E293B] text-white py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span>
                            {acceptMutation.isPending
                              ? 'Joining...'
                              : inviteData.isLoggedIn
                              ? 'Join Project Now'
                              : isExisting
                              ? 'Verify & Join'
                              : 'Complete Registration & Join'}
                          </span>
                          <ArrowRight className="w-4 h-4 text-[#22C55E]" />
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
