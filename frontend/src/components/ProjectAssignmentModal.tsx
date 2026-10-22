'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Sparkles, FolderKanban, ArrowRight, X, Check, ShieldCheck } from 'lucide-react';

interface ProjectAssignmentModalProps {
  onOpenProject?: (projectId: string) => void;
}

export const ProjectAssignmentModal: React.FC<ProjectAssignmentModalProps> = ({
  onOpenProject
}) => {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, currentWorkspace, setCurrentProject, projects, fetchProjects } = useAuthStore();

  // Query unread project assignments
  const { data: notifications = [], refetch } = useQuery({
    queryKey: ['my-project-notifications'],
    queryFn: async () => {
      const res = await api.get('/auth/my-project-notifications');
      return res.data?.data || [];
    },
    enabled: isAuthenticated && !!user
  });

  // Mutation to dismiss notifications
  const dismissMutation = useMutation({
    mutationFn: async (projectId?: string) => {
      const res = await api.post('/auth/my-project-notifications/dismiss', {
        projectId
      });
      return res.data;
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['my-project-notifications'] });
    }
  });

  if (!isAuthenticated || notifications.length === 0) {
    return null;
  }

  const latestNotice = notifications[0];

  const handleOpenProject = async (projectId: string) => {
    // 1. Dismiss notification
    dismissMutation.mutate(projectId);

    // 2. Refresh projects if needed
    if (currentWorkspace?._id) {
      await fetchProjects(currentWorkspace._id);
    }

    // 3. Find target project
    const targetProject = projects.find((p) => p._id === projectId);
    if (targetProject) {
      setCurrentProject(targetProject);
      if (typeof window !== 'undefined') {
        localStorage.setItem('selected_project_id', projectId);
      }
    }

    // 4. Trigger callback if passed (to navigate to board)
    if (onOpenProject) {
      onOpenProject(projectId);
    }
  };

  const handleDismissAll = () => {
    dismissMutation.mutate();
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#0F172A]/15 w-full max-w-md overflow-hidden text-slate-800">
        
        {/* Banner with celebratory gradient */}
        <div className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] text-white p-6 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-[#22C55E]/15 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#22C55E]">
              <Sparkles className="w-5 h-5" />
            </div>
            <button
              onClick={handleDismissAll}
              className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-lg font-black tracking-tight text-white">
            You've Been Assigned to a Project!
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            An organization admin has assigned you to collaborate on the following project:
          </p>
        </div>

        {/* Project Card Details */}
        <div className="p-6 space-y-4">
          <div className="bg-[#F8FAFC] border border-[#0F172A]/10 rounded-xl p-4 flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded">
                  {latestNotice.projectKey}
                </span>
                <span className="font-extrabold text-sm text-[#0F172A] truncate">
                  {latestNotice.projectName}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1 flex items-center gap-2">
                <span>By {latestNotice.assignedBy || 'Organization Admin'}</span>
                <span>•</span>
                <span>
                  {latestNotice.assignedAt
                    ? new Date(latestNotice.assignedAt).toLocaleDateString()
                    : 'Just now'}
                </span>
              </div>
            </div>
          </div>

          {notifications.length > 1 && (
            <div className="text-xs font-bold text-slate-500 text-center">
              + {notifications.length - 1} other new project assignment(s)
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              onClick={handleDismissAll}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-slate-600 hover:text-[#0F172A] bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            >
              Dismiss
            </button>

            <button
              onClick={() => handleOpenProject(latestNotice.projectId)}
              className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-[#0F172A] hover:bg-slate-800 rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Open Project</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
