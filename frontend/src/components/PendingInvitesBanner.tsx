'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { formatRole } from '../lib/formatters';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Building,
  FolderKanban,
  Users,
  ArrowRight,
  Sparkles,
  Loader2,
  X
} from 'lucide-react';

export const PendingInvitesBanner: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, fetchWorkspaces, fetchProjects, setCurrentWorkspace, setCurrentProject } = useAuthStore();
  const [actingToken, setActingToken] = useState<string | null>(null);

  // Fetch pending invites for currently logged-in user
  const { data: myInvites = [], isLoading } = useQuery({
    queryKey: ['my-pending-invites', user?.email],
    queryFn: async () => {
      const res = await api.get('/invites/my-invites');
      return res.data?.data || [];
    },
    enabled: !!user?.email,
    refetchInterval: 30000 // Poll every 30 seconds for real-time invites
  });

  // Accept Mutation
  const acceptMutation = useMutation({
    mutationFn: async (token: string) => {
      setActingToken(token);
      const res = await api.post(`/invites/${token}/accept`, {});
      return res.data;
    },
    onSuccess: async (data) => {
      setActingToken(null);
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['my-pending-invites'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });

      // Refresh workspaces & projects in auth store
      await fetchWorkspaces();
      if (data?.data?.workspace) {
        setCurrentWorkspace(data.data.workspace);
      }
      if (data?.data?.project) {
        setCurrentProject({
          _id: data.data.project.id,
          name: data.data.project.name,
          key: data.data.project.key,
          workspaceId: data.data.workspace?.id
        });
      }
    },
    onError: () => {
      setActingToken(null);
    }
  });

  // Decline Mutation
  const declineMutation = useMutation({
    mutationFn: async (token: string) => {
      setActingToken(token);
      const res = await api.post(`/invites/${token}/decline`, {
        comment: 'Declined via in-app banner'
      });
      return res.data;
    },
    onSuccess: () => {
      setActingToken(null);
      queryClient.invalidateQueries({ queryKey: ['my-pending-invites'] });
    },
    onError: () => {
      setActingToken(null);
    }
  });

  if (isLoading || !myInvites || myInvites.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 w-full px-4 sm:px-6 pt-3 select-none">
      {myInvites.map((inv: any) => {
        const token = inv.token;
        const isActing = actingToken === token;
        const workspaceName = inv.workspaceId?.name || 'Workspace';
        const projectName = inv.projectId?.name;
        const projectKey = inv.projectId?.key;
        const teamName = inv.teamId?.name;

        return (
          <div
            key={inv._id}
            className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-3 sm:p-4 shadow-lg border border-blue-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-slide-up"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0">
                <Bell className="w-5 h-5 text-amber-400 animate-bounce" />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-400/30 px-2 py-0.5 rounded-full">
                    Invitation Received
                  </span>
                  <span className="text-xs font-bold text-slate-300">
                    Role: <strong className="text-white">{formatRole(inv.role)}</strong>
                  </span>
                </div>

                <div className="text-sm font-semibold text-white mt-1 flex items-center gap-1.5 flex-wrap">
                  <span>You've been invited to join</span>
                  <strong className="text-blue-300 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 inline" /> {workspaceName}
                  </strong>
                  {projectName && (
                    <>
                      <span>• Project</span>
                      <strong className="text-emerald-300 flex items-center gap-1">
                        <FolderKanban className="w-3.5 h-3.5 inline" /> [{projectKey}] {projectName}
                      </strong>
                    </>
                  )}
                  {teamName && (
                    <>
                      <span>• Team</span>
                      <strong className="text-purple-300 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 inline" /> {teamName}
                      </strong>
                    </>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 mt-0.5">
                  Invited by <strong className="text-slate-300">{inv.inviterId?.name || 'Admin'}</strong>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => declineMutation.mutate(token)}
                disabled={isActing}
                className="px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-white/10 hover:bg-rose-500/30 hover:border-rose-400/40 border border-white/10 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                {isActing && declineMutation.isPending ? 'Declining...' : 'Decline'}
              </button>

              <button
                onClick={() => acceptMutation.mutate(token)}
                disabled={isActing}
                className="px-4 py-1.5 text-xs font-bold text-[#0F172A] bg-[#22C55E] hover:bg-emerald-400 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isActing && acceptMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Joining...</span>
                  </>
                ) : (
                  <>
                    <span>Accept & Join</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
