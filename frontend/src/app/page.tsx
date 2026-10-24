'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { usePermissionStore } from '../store/permissionStore';
import { getSocket } from '../lib/socket';
import { broadcastSyncEvent, subscribeCrossTabSync } from '../lib/crossTabSync';
import { Navbar } from '../components/Navbar';
import { Sidebar } from '../components/Sidebar';
import { KanbanBoard } from '../components/KanbanBoard';
import { SummaryView } from '../components/SummaryView';
import { BacklogView } from '../components/BacklogView';
import { TimelineView } from '../components/TimelineView';
import { DocsView } from '../components/DocsView';
import { FormsView } from '../components/FormsView';
import { RequestsView } from '../components/RequestsView';
import { AnalyticsView } from '../components/AnalyticsView';
import { DashboardView } from '../components/DashboardView';
import { TeamsProgressView } from '../components/TeamsProgressView';
import { DependencyGraphModal } from '../components/DependencyGraphModal';
import { InfiniteTaskList } from '../components/InfiniteTaskList';
import { AdminPanel } from '../components/AdminPanel';
import { RolesPermissionManager } from '../components/RolesPermissionManager';
import { TeamManagement } from '../components/TeamManagement';
import { RecycleBinView } from '../components/RecycleBinView';
import { TaskModal } from '../components/TaskModal';
import { SubscriptionModal } from '../components/SubscriptionModal';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { InviteModal } from '../components/InviteModal';
import { ProfileModal } from '../components/ProfileModal';
import { HelpCenterModal } from '../components/HelpCenterModal';
import { ProjectAssignmentModal } from '../components/ProjectAssignmentModal';
import { PendingInvitesBanner } from '../components/PendingInvitesBanner';
import {
  Kanban,
  ListFilter,
  ShieldCheck,
  LayoutDashboard,
  LayoutGrid,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  Layers,
  FolderKanban,
  UserPlus,
  UserCircle,
  Share2,
  SlidersHorizontal,
  Maximize2,
  FileText,
  FileCheck2,
  Inbox,
  Plus,
  MoreHorizontal,
  BarChart2,
  GitGraph,
  Users,
  Trash2
} from 'lucide-react';
import api from '../lib/api';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';

export type TabType =
  | 'dashboard'
  | 'summary'
  | 'teams'
  | 'backlog'
  | 'board'
  | 'timeline'
  | 'docs'
  | 'forms'
  | 'requests'
  | 'list'
  | 'analytics'
  | 'admin'
  | 'roles'
  | 'teams-management'
  | 'recycle-bin'
  | 'recycle-bin-tasks'
  | 'recycle-bin-projects'
  | 'recycle-bin-requests'
  | 'recycle-bin-teams';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    user,
    isAuthenticated,
    isLoading,
    fetchUser,
    workspaces,
    fetchWorkspaces,
    currentWorkspace,
    projects,
    fetchProjects,
    currentProject,
    setCurrentProject
  } = useAuthStore();

  // Project Tabs states - restored seamlessly on refresh from URL or tab-isolated sessionStorage
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab) return urlTab as TabType;
      const savedTab = sessionStorage.getItem('active_tab');
      if (savedTab) return savedTab as TabType;
    }
    return 'dashboard';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [targetSubtaskId, setTargetSubtaskId] = useState<string | null>(null);
  const [targetMicrotaskId, setTargetMicrotaskId] = useState<string | null>(null);
  const [targetMinitaskId, setTargetMinitaskId] = useState<string | null>(null);
  const [initialTaskStatus, setInitialTaskStatus] = useState<string>('TODO');
  const [initialTaskTeam, setInitialTaskTeam] = useState<string>('');
  const [initialTaskSprintId, setInitialTaskSprintId] = useState<string>('');
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const { canView, canCreate, fetchPermissions, isLoading: permissionsLoading } = usePermissionStore();

  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER';
  const isProjectLead = currentProject?.leadId && (
    (currentProject.leadId._id || currentProject.leadId).toString() === user?._id?.toString() ||
    (currentProject.leadId._id || currentProject.leadId).toString() === (user as any)?.id?.toString()
  );
  const canDeleteCurrentProject = isOrgAdmin || isPM || isProjectLead;
  const canCreateProject = isOrgAdmin || isPM;

  const handleDeleteCurrentProject = async () => {
    if (!projectToDelete || !currentWorkspace?._id) return;
    setIsDeletingProject(true);
    try {
      const res = await api.delete(`/projects/${projectToDelete._id}`);
      if (res.data?.success) {
        broadcastSyncEvent('PROJECT_DELETED', { projectId: projectToDelete._id });
        await fetchProjects(currentWorkspace._id);
        queryClient.invalidateQueries({ queryKey: ['workspace-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['recycle-bin'] });
        setActiveTab('dashboard');
        setProjectToDelete(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to move space to Recycle Bin');
    } finally {
      setIsDeletingProject(false);
    }
  };

  // Multi-Tab & Real-Time Sync: Reflect deletions, restorations, and workspace updates across all open tabs
  useEffect(() => {
    if (!currentWorkspace?._id) return;

    const handleSync = () => {
      // 1. Refresh Spaces / Projects in sidebar
      fetchProjects(currentWorkspace._id);
      // 2. Invalidate relevant react-queries so Dashboard & Kanban views update automatically
      queryClient.invalidateQueries({ queryKey: ['workspace-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      queryClient.invalidateQueries({ queryKey: ['project-sprints'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks'] });
      // 3. Notify views like RecycleBinView to refresh immediately
      window.dispatchEvent(new CustomEvent('outdid:workspace-refresh'));
    };

    // Listen to local & other browser tabs via BroadcastChannel / LocalStorage
    const unsubscribe = subscribeCrossTabSync((_msg) => {
      handleSync();
    });

    // Listen to global WebSockets
    const s = getSocket();
    s.on('task:deleted', handleSync);
    s.on('task:restored', handleSync);
    s.on('project:deleted', handleSync);
    s.on('project:restored', handleSync);
    s.on('recycle-bin:changed', handleSync);

    return () => {
      unsubscribe();
      s.off('task:deleted', handleSync);
      s.off('task:restored', handleSync);
      s.off('project:deleted', handleSync);
      s.off('project:restored', handleSync);
      s.off('recycle-bin:changed', handleSync);
    };
  }, [currentWorkspace?._id, fetchProjects, queryClient]);

  // Initialize Auth & Workspace
  useEffect(() => {
    fetchUser();
    fetchWorkspaces();
  }, [fetchUser, fetchWorkspaces]);

  // Redirect to login if not authenticated after load
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Fetch Projects & Permissions when workspace changes
  useEffect(() => {
    if (currentWorkspace?._id) {
      fetchProjects(currentWorkspace._id);
      fetchPermissions(currentWorkspace._id);
    }
  }, [currentWorkspace?._id, fetchProjects, fetchPermissions]);

  // Protect Roles & Permissions tab: Strictly Org Admins only
  useEffect(() => {
    const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
    if (activeTab === 'roles' && !isOrgAdmin) {
      setActiveTab('dashboard');
    }
  }, [activeTab, user]);

  // Expose clean navigation hooks for testing & automation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__navigateView = (tab: any) => {
        setIsTaskModalOpen(false);
        setIsGraphModalOpen(false);
        setIsInviteModalOpen(false);
        setIsSubscriptionOpen(false);
        setIsNewProjectOpen(false);
        setActiveTab(tab);
      };
      (window as any).__openCreateTask = () => {
        setIsGraphModalOpen(false);
        setIsInviteModalOpen(false);
        setIsNewProjectOpen(false);
        setSelectedTask(null);
        setInitialTaskStatus('TODO');
        setIsTaskModalOpen(true);
      };
      (window as any).__openTaskDetails = (task: any) => {
        setIsGraphModalOpen(false);
        setIsInviteModalOpen(false);
        setIsNewProjectOpen(false);
        setSelectedTask(task || {
          _id: 'sample-task',
          key: 'SGH-101',
          title: 'Power Supply Circuit & Regulator Optimization',
          description: 'Design and validate multi-rail Buck-Boost switching regulators for 3.3V, 1.8V, and 0.9V with < 15mV ripple.',
          priority: 'URGENT',
          status: 'IN_PROGRESS',
          type: 'TASK',
          storyPoints: 8,
          subtasks: [
            { id: '1', title: 'Schematic review for switching node thermals', completed: true },
            { id: '2', title: 'Oscilloscope ripple measurement under 5A peak load', completed: false }
          ],
          worklogs: [
            { id: 'w1', user: { name: 'Arun Kumar' }, timeSpentMinutes: 180, description: 'Simulated inductor saturation in LTSpice', createdAt: new Date() }
          ]
        });
        setIsTaskModalOpen(true);
      };
      (window as any).__openCreateProject = () => {
        if (!canCreateProject) return;
        setIsTaskModalOpen(false);
        setIsGraphModalOpen(false);
        setIsInviteModalOpen(false);
        setIsSubscriptionOpen(false);
        setIsNewProjectOpen(true);
      };
      (window as any).__openInviteModal = () => {
        setIsTaskModalOpen(false);
        setIsGraphModalOpen(false);
        setIsNewProjectOpen(false);
        setIsSubscriptionOpen(false);
        setIsInviteModalOpen(true);
      };
      (window as any).__openGraph = () => {
        setIsTaskModalOpen(false);
        setIsInviteModalOpen(false);
        setIsNewProjectOpen(false);
        setIsGraphModalOpen(true);
      };
      (window as any).__closeModals = () => {
        setIsTaskModalOpen(false);
        setIsGraphModalOpen(false);
        setIsInviteModalOpen(false);
        setIsSubscriptionOpen(false);
        setIsNewProjectOpen(false);
      };
    }
  }, []);

  const allProjectTabs = [
    { id: 'summary', label: 'Summary', icon: LayoutDashboard },
    { id: 'teams', label: 'Teams & Progress', icon: Users },
    { id: 'backlog', label: 'Backlog', icon: ListFilter },
    { id: 'board', label: 'Board', icon: Kanban },
    { id: 'docs', label: 'Docs', icon: FileText },
    { id: 'forms', label: 'Forms', icon: FileCheck2 },
    { id: 'requests', label: 'Requests', icon: Inbox }
  ];

  const projectTabs = allProjectTabs.filter((tab) => canView(tab.id));

  // Synchronize activeTab to URL query parameter and tab-isolated sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('active_tab', activeTab);
      const url = new URL(window.location.href);
      if (url.searchParams.get('tab') !== activeTab) {
        url.searchParams.set('tab', activeTab);
        window.history.replaceState(null, '', url.toString());
      }
    }
  }, [activeTab]);

  // Support browser Back/Forward navigation between views
  useEffect(() => {
    const handlePopState = () => {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab) {
        setActiveTab(urlTab as TabType);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Safe fallback to first permitted tab only after workspace, auth, and permissions have finished loading
  useEffect(() => {
    if (isLoading || permissionsLoading || !isAuthenticated || !currentWorkspace) return;

    const isGlobalTab =
      activeTab === 'dashboard' ||
      activeTab === 'admin' ||
      activeTab === 'roles' ||
      activeTab === 'teams-management' ||
      activeTab.startsWith('recycle-bin');

    if (!isGlobalTab && !canView(activeTab) && projectTabs.length > 0) {
      setActiveTab(projectTabs[0].id as any);
    }
  }, [activeTab, canView, projectTabs, isLoading, permissionsLoading, isAuthenticated, currentWorkspace]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B192C] via-[#0F172A] to-[#1E293B] flex items-center justify-center p-4 relative overflow-hidden select-none">
        {/* Ambient Glows */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center gap-5 z-10 max-w-xs text-center animate-fade-in">
          {/* Animated Glowing Logo Badge */}
          <div className="relative">
            <div className="absolute -inset-2 rounded-3xl bg-gradient-to-r from-blue-600 to-emerald-500 opacity-40 blur-md animate-pulse" />
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0F172A] to-[#1E293B] border border-white/15 flex items-center justify-center text-white font-black text-xl shadow-2xl relative">
              <span className="text-[#22C55E] tracking-tight">OS</span>
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#22C55E] ring-4 ring-[#0F172A] animate-pulse" />
            </div>
          </div>

          {/* Branding Title */}
          <div>
            <div className="flex items-center justify-center gap-1.5 text-white font-black text-lg tracking-tight">
              <span>Outdid</span>
              <span className="text-[#22C55E]">Sync</span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Synchronizing workspace & projects...
            </p>
          </div>

          {/* Slim Animated Progress Bar */}
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden relative">
            <div className="h-full bg-gradient-to-r from-blue-500 via-emerald-400 to-blue-500 rounded-full animate-shimmer" style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    );
  }

  const handleOpenCreateTask = (status: string = 'TODO', team?: string, sprintId?: string) => {
    setSelectedTask(null);
    setInitialTaskStatus(status);
    setInitialTaskTeam(team || '');
    setInitialTaskSprintId(sprintId || '');
    setIsTaskModalOpen(true);
  };

  const handleSelectTask = (
    task: any,
    context?: { targetSubtaskId?: string; targetMicrotaskId?: string; targetMinitaskId?: string }
  ) => {
    setSelectedTask(task);
    setTargetSubtaskId(context?.targetSubtaskId || null);
    setTargetMicrotaskId(context?.targetMicrotaskId || null);
    setTargetMinitaskId(context?.targetMinitaskId || null);
    setIsTaskModalOpen(true);
  };

  const currentUserId = (user as any)?._id || user?.id;
  const isProjectLeadOrManager =
    currentProject?.leadId?._id === currentUserId ||
    currentProject?.leadId === currentUserId ||
    (currentProject?.members &&
      currentProject.members.some(
        (m: any) =>
          (m.userId?._id === currentUserId || m.userId === currentUserId) &&
          ['PROJECT_MANAGER', 'TEAM_LEAD', 'LEAD'].includes(m.role)
      ));
  const canInvite = isOrgAdmin || isProjectLeadOrManager || canCreate('admin');

  return (
    <div className="h-full max-h-screen overflow-hidden bg-[#FAFBFC] text-[#172B4D] flex flex-col antialiased">
      {/* Top Navbar */}
      <Navbar
        onOpenCreateTask={() => handleOpenCreateTask('TODO')}
        onOpenSubscription={() => setIsSubscriptionOpen(true)}
        onOpenInvite={() => setIsInviteModalOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenHelp={() => setIsHelpCenterOpen(true)}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeTab={activeTab}
        setActiveTab={setActiveTab as any}
      />

      {/* In-App Pending Invitation Alert Banner */}
      <PendingInvitesBanner />

      {/* Main Workspace Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab as any}
          onOpenNewProject={() => {
            if (canCreateProject) setIsNewProjectOpen(true);
          }}
          onOpenSubscription={() => setIsSubscriptionOpen(true)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Dynamic Content Canvas */}
        <main className={`flex-1 min-h-0 overflow-y-auto min-w-0 bg-[#F8FAFC] ${
          activeTab === 'board' || (activeTab as any) === 'kanban'
            ? 'p-3 sm:p-4 pb-2'
            : 'p-3 sm:p-5 lg:p-6 pb-8'
        }`}>
          {/* Top Breadcrumb & Project Header (Only for project-specific tabs) */}
          {!['admin', 'roles', 'teams-management', 'dashboard', 'recycle-bin', 'recycle-bin-tasks', 'recycle-bin-projects', 'recycle-bin-requests', 'recycle-bin-teams'].includes(activeTab) && (
            <div className="flex flex-col gap-2 pb-2 mb-3 border-b border-slate-200 shrink-0">
              {/* Breadcrumbs: Spaces > [Project Name] */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="text-[11px] font-medium text-slate-400">
                    Spaces
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 min-w-[24px] min-h-[24px] aspect-square shrink-0 rounded-md text-white flex items-center justify-center font-bold text-xs shadow-2xs"
                      style={{ backgroundColor: currentProject?.color || '#0052CC' }}
                    >
                      {currentProject?.key?.charAt(0) || 'P'}
                    </div>
                    <span className="text-slate-900 font-bold text-base tracking-tight">
                      {currentProject?.name || 'My Project'}
                    </span>
                    <button className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition-colors cursor-pointer">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Top Right Project Actions */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={() => setIsGraphModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-200/80 transition-all cursor-pointer"
                    title="Interactive Issue Dependency Graph"
                  >
                    <GitGraph className="w-3.5 h-3.5 text-slate-600" />
                    <span className="hidden sm:inline">Dependencies (DAG)</span>
                  </button>

                  {canInvite && (
                    <button
                      onClick={() => setIsInviteModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-semibold border border-blue-200/80 transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 text-blue-600" />
                      <span>Invite</span>
                    </button>
                  )}

                  {canDeleteCurrentProject && currentProject && (
                    <button
                      onClick={() => setProjectToDelete(currentProject)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold border border-rose-200/80 transition-colors cursor-pointer"
                      title="Move Space to Recycle Bin (30-day retention)"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span className="hidden sm:inline">Delete Space</span>
                    </button>
                  )}

                  <button className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer" title="Share Project">
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer" title="Full view">
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Dynamic Project Tab Strip */}
              <div className="flex items-center gap-1 overflow-x-auto pt-1 no-scrollbar border-b border-slate-200/60 -mb-[1px]">
                {projectTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-all relative shrink-0 cursor-pointer border-b-2 -mb-[2px] ${
                        isActive
                          ? 'text-blue-600 border-blue-600'
                          : 'text-slate-500 hover:text-slate-800 border-transparent hover:border-slate-300'
                      }`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}

                <button
                  onClick={() => handleOpenCreateTask('TODO')}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors ml-1 cursor-pointer"
                  title="Add dynamic view"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Active Tab View Rendering */}
          <div className="animate-slide-up">
            {activeTab === 'dashboard' && (
              <DashboardView
                onSelectProject={(proj) => {
                  setCurrentProject(proj);
                  setActiveTab('board');
                }}
                onSelectTask={handleSelectTask}
                onNavigateTab={(tab: string) => setActiveTab(tab as any)}
              />
            )}

            {activeTab === 'summary' && (
              <SummaryView
                projectId={currentProject?._id || ''}
                onSelectTask={handleSelectTask}
                onNavigateTab={(tab: string) => setActiveTab(tab as any)}
              />
            )}

            {activeTab === 'teams' && (
              <TeamsProgressView
                projectId={currentProject?._id || ''}
                onSelectTask={handleSelectTask}
                onNavigateTab={(tab: string) => setActiveTab(tab as any)}
              />
            )}

            {activeTab === 'backlog' && (
              <BacklogView
                projectId={currentProject?._id || ''}
                onSelectTask={handleSelectTask}
                onOpenCreateTask={handleOpenCreateTask}
              />
            )}

            {(activeTab === 'board' || (activeTab as any) === 'kanban') && (
              <KanbanBoard
                projectId={currentProject?._id || ''}
                onSelectTask={handleSelectTask}
                onOpenCreateTask={handleOpenCreateTask}
                searchQuery={searchQuery}
              />
            )}

            {activeTab === 'timeline' && (
              <TimelineView
                projectId={currentProject?._id || ''}
                onSelectTask={handleSelectTask}
              />
            )}

            {activeTab === 'docs' && (
              <DocsView projectId={currentProject?._id || ''} />
            )}

            {activeTab === 'forms' && (
              <FormsView projectId={currentProject?._id || ''} />
            )}

            {activeTab === 'requests' && (
              <RequestsView projectId={currentProject?._id || ''} />
            )}

            {activeTab === 'list' && (
              <InfiniteTaskList
                projectId={currentProject?._id}
                onSelectTask={handleSelectTask}
                searchQuery={searchQuery}
              />
            )}

            {activeTab === 'analytics' && (
              <SummaryView
                projectId={currentProject?._id || ''}
                onSelectTask={handleSelectTask}
                onNavigateTab={(tab: string) => setActiveTab(tab as any)}
              />
            )}

            {activeTab === 'admin' && <AdminPanel />}
            {activeTab === 'roles' && <RolesPermissionManager />}
            {activeTab === 'teams-management' && <TeamManagement />}
            {activeTab === 'recycle-bin' && <RecycleBinView initialTab="ALL" />}
            {activeTab === 'recycle-bin-tasks' && <RecycleBinView initialTab="TASK" />}
            {activeTab === 'recycle-bin-projects' && <RecycleBinView initialTab="PROJECT" />}
            {activeTab === 'recycle-bin-requests' && <RecycleBinView initialTab="REQUEST" />}
            {activeTab === 'recycle-bin-teams' && <RecycleBinView initialTab="TEAM" />}
          </div>
        </main>
      </div>

      {/* Interactive Modals */}
      {isTaskModalOpen && (
        <TaskModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setTargetSubtaskId(null);
            setTargetMicrotaskId(null);
            setTargetMinitaskId(null);
          }}
          task={selectedTask}
          initialStatus={initialTaskStatus}
          initialTeam={initialTaskTeam}
          initialSprintId={initialTaskSprintId}
          initialTargetSubtaskId={targetSubtaskId || undefined}
          initialTargetMicrotaskId={targetMicrotaskId || undefined}
          initialTargetMinitaskId={targetMinitaskId || undefined}
          projectId={currentProject?._id || (projects && projects[0]?._id) || ''}
        />
      )}

      {isGraphModalOpen && (
        <DependencyGraphModal
          isOpen={isGraphModalOpen}
          onClose={() => setIsGraphModalOpen(false)}
          projectId={currentProject?._id || (projects && projects[0]?._id) || ''}
          projectName={currentProject?.name}
          onSelectTask={handleSelectTask}
        />
      )}

      {isSubscriptionOpen && (
        <SubscriptionModal
          isOpen={isSubscriptionOpen}
          onClose={() => setIsSubscriptionOpen(false)}
        />
      )}

      {isNewProjectOpen && canCreateProject && (
        <CreateProjectModal
          isOpen={isNewProjectOpen}
          onClose={() => setIsNewProjectOpen(false)}
        />
      )}

      {isInviteModalOpen && (
        <InviteModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          projectId={
            ['board', 'timeline', 'backlog', 'summary', 'docs', 'forms', 'list'].includes(activeTab)
              ? currentProject?._id
              : undefined
          }
          projectName={
            ['board', 'timeline', 'backlog', 'summary', 'docs', 'forms', 'list'].includes(activeTab)
              ? currentProject?.name
              : undefined
          }
        />
      )}

      {isProfileOpen && (
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {isHelpCenterOpen && (
        <HelpCenterModal
          isOpen={isHelpCenterOpen}
          onClose={() => setIsHelpCenterOpen(false)}
          onNavigateTab={(tab: any) => setActiveTab(tab)}
        />
      )}

      {/* Delete Space Modal */}
      {projectToDelete && (
        <DeleteConfirmModal
          isOpen={!!projectToDelete}
          onClose={() => setProjectToDelete(null)}
          onConfirm={handleDeleteCurrentProject}
          title="Move Space to Recycle Bin?"
          itemName={projectToDelete.name}
          itemType="Project"
          cascadeWarning="All tasks, sprints, and request intake records belonging to this space will also be moved to the Recycle Bin. You can restore them together at any time within 30 days."
          isLoading={isDeletingProject}
        />
      )}

      {/* Global Project Assignment Notification Modal upon Login/Assignment */}
      <ProjectAssignmentModal onOpenProject={() => setActiveTab('board')} />
    </div>
  );
}

