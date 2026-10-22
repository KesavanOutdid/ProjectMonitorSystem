'use client';

import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { usePermissionStore } from '../store/permissionStore';
import {
  UserCircle,
  Globe,
  LayoutGrid,
  ChevronRight,
  ChevronDown,
  Plus,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  Zap,
  Users,
  Layers,
  Trash2,
  FolderKanban,
  CheckSquare,
  HelpCircle
} from 'lucide-react';
import api from '../lib/api';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { broadcastSyncEvent } from '../lib/crossTabSync';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenNewProject: () => void;
  onOpenSubscription?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenNewProject,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { user, projects, currentProject, setCurrentProject, currentWorkspace, fetchProjects } = useAuthStore();
  const { canView, isOrgAdmin: permIsOrgAdmin } = usePermissionStore();

  const [spacesOpen, setSpacesOpen] = useState(true);
  const [recycleBinOpen, setRecycleBinOpen] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER';
  const canAccessRoles = isOrgAdmin; // STRICTLY Org Admin only! PMs and Members NEVER see Roles & Permissions
  const canAccessMembers = isOrgAdmin || isPM;
  const canAccessTeams = isOrgAdmin || isPM || canView('teams');
  const canCreateProject = isOrgAdmin || isPM;
  const canAccessRecycleBin = !!user;

  const handleDeleteProject = async () => {
    if (!projectToDelete || !currentWorkspace?._id) return;
    setIsDeletingProject(true);
    try {
      const res = await api.delete(`/projects/${projectToDelete._id}`);
      if (res.data?.success) {
        broadcastSyncEvent('PROJECT_DELETED', { projectId: projectToDelete._id });
        await fetchProjects(currentWorkspace._id);
        if (currentProject?._id === projectToDelete._id) {
          setActiveTab('dashboard');
        }
        setProjectToDelete(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to move space to Recycle Bin');
    } finally {
      setIsDeletingProject(false);
    }
  };

  const handleSelectProject = (proj: any) => {
    setCurrentProject(proj);
    const isGlobalOnlyTab =
      activeTab === 'dashboard' ||
      activeTab === 'admin' ||
      activeTab === 'roles' ||
      activeTab === 'teams-management' ||
      activeTab.startsWith('recycle-bin');

    if (isGlobalOnlyTab) {
      setActiveTab('summary');
    }
  };

  // ─── COLLAPSED SIDEBAR ───────────────────────────────
  if (isCollapsed) {
    const CollapsedBtn = ({
      onClick,
      isActive,
      icon: Icon,
      tip,
      badge
    }: {
      onClick: () => void;
      isActive: boolean;
      icon: React.ElementType;
      tip: string;
      accentOnActive?: boolean;
      badge?: string;
    }) => (
      <button
        onClick={onClick}
        data-tip={tip}
        className={`sidebar-tooltip relative w-10 h-10 min-w-[40px] min-h-[40px] aspect-square shrink-0 rounded-xl flex items-center justify-center transition-all duration-150 cursor-pointer group ${
          isActive
            ? 'bg-blue-50 text-blue-600 shadow-2xs'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        <Icon
          className={`w-[18px] h-[18px] shrink-0 transition-colors ${
            isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'
          }`}
        />
        {badge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-[7px] font-bold text-white rounded-full flex items-center justify-center shadow-2xs shrink-0">
            {badge}
          </span>
        )}
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 rounded-r-full" />
        )}
      </button>
    );

    return (
      <aside className="w-[60px] bg-white border-r border-slate-200 flex flex-col justify-between h-full flex-shrink-0 select-none transition-all duration-300 ease-out overflow-hidden">
        {/* Top Navigation Section */}
        <div className="flex flex-col items-center gap-1 pt-2.5 pb-2 px-1.5 w-full flex-1 min-h-0">
          {/* Expand Button */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              data-tip="Expand sidebar"
              className="sidebar-tooltip w-10 h-10 min-w-[40px] min-h-[40px] aspect-square shrink-0 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer mb-1"
            >
              <PanelLeft className="w-[18px] h-[18px] text-blue-600" />
            </button>
          )}

          <div className="w-8 h-px bg-slate-200 my-1 shrink-0" />

          {/* Primary Nav Icons */}
          <CollapsedBtn
            onClick={() => setActiveTab('dashboard')}
            isActive={activeTab === 'dashboard'}
            icon={LayoutGrid}
            tip="Dashboard (Home)"
          />

          <CollapsedBtn
            onClick={() => setActiveTab('board')}
            isActive={activeTab === 'board' || activeTab === 'kanban'}
            icon={Globe}
            tip="Spaces & Board"
          />

          {/* ─── Project Badges ─── */}
          <div className="w-full flex flex-col items-center gap-1.5 py-2 my-1 border-y border-slate-200 shrink-0">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              Spaces
            </span>
            {projects.slice(0, 4).map((proj) => {
              const isSelected = currentProject?._id === proj._id;
              return (
                <button
                  key={proj._id}
                  onClick={() => handleSelectProject(proj)}
                  data-tip={`${proj.name} [${proj.key}]`}
                  className={`sidebar-tooltip relative w-8 h-8 min-w-[32px] min-h-[32px] aspect-square shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold text-white transition-all duration-150 cursor-pointer shadow-2xs ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white scale-105 shadow-sm'
                      : 'opacity-85 hover:opacity-100 hover:scale-105'
                  }`}
                  style={{ backgroundColor: proj.color || '#0052CC' }}
                >
                  <span className="leading-none">{proj.key.charAt(0)}</span>
                  {isSelected && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-600 rounded-full" />
                  )}
                </button>
              );
            })}

            {canCreateProject && (
              <button
                onClick={onOpenNewProject}
                data-tip="New Space"
                className="sidebar-tooltip w-8 h-8 min-w-[32px] min-h-[32px] aspect-square shrink-0 rounded-lg bg-slate-50 border border-dashed border-slate-300 hover:border-blue-500 text-slate-400 hover:text-blue-600 flex items-center justify-center transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canAccessMembers && (
            <CollapsedBtn
              onClick={() => setActiveTab('admin')}
              isActive={activeTab === 'admin'}
              icon={Users}
              tip={isOrgAdmin ? 'Organization Members & Invites' : 'Project Members'}
            />
          )}

          {canAccessRoles && (
            <CollapsedBtn
              onClick={() => setActiveTab('roles')}
              isActive={activeTab === 'roles'}
              icon={ShieldCheck}
              tip="Roles & Tab Permissions"
              badge="R"
            />
          )}

          {canAccessTeams && (
            <CollapsedBtn
              onClick={() => setActiveTab('teams-management')}
              isActive={activeTab === 'teams-management'}
              icon={Layers}
              tip="Teams Management"
            />
          )}

          {canAccessRecycleBin && (
            <CollapsedBtn
              onClick={() => setActiveTab('recycle-bin')}
              isActive={
                activeTab === 'recycle-bin' ||
                activeTab === 'recycle-bin-tasks' ||
                activeTab === 'recycle-bin-projects' ||
                activeTab === 'recycle-bin-requests' ||
                activeTab === 'recycle-bin-teams'
              }
              icon={Trash2}
              tip="Recycle Bin (30-day retention)"
            />
          )}
        </div>

        {/* Footer Status */}
        <div className="flex flex-col items-center pb-3 px-2 gap-2 shrink-0 bg-white">
          <div className="w-8 h-px bg-slate-200 shrink-0" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0 ring-2 ring-emerald-200/50" title="System Connected" />
        </div>
      </aside>
    );
  }

  // ─── EXPANDED SIDEBAR ──────────────────────────────────
  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between h-full flex-shrink-0 select-none transition-all duration-300 ease-out">
      <div className="p-3 flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">
        
        {/* Top Header Row with Collapse Button */}
        <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Workspace Nav
          </span>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse Sidebar"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 1. DASHBOARD (HOMEPAGE) */}
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer group ${
            activeTab === 'dashboard'
              ? 'bg-blue-50 text-blue-700 shadow-2xs font-bold border-l-2 border-blue-600'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <LayoutGrid className={`w-4.5 h-4.5 ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'}`} />
          <span>Dashboard</span>
          {activeTab === 'dashboard' && <span className="w-2 h-2 rounded-full bg-blue-600 ml-auto" />}
        </button>

        {/* 4. SPACES / PROJECTS */}
        <div>
          <div className="flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-all">
            <button
              onClick={() => setSpacesOpen(!spacesOpen)}
              className="flex items-center gap-3 flex-1 text-left cursor-pointer"
            >
              <Globe className="w-4.5 h-4.5 text-slate-500" />
              <span>Spaces / Projects</span>
            </button>
            <div className="flex items-center gap-1">
              {canCreateProject && (
                <button
                  onClick={onOpenNewProject}
                  title="Create Space / Project"
                  className="text-slate-500 hover:text-blue-600 p-1 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setSpacesOpen(!spacesOpen)} className="text-slate-500 p-0.5 cursor-pointer">
                {spacesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {spacesOpen && (
            <div className="pl-3 pr-1 py-1 flex flex-col gap-0.5 animate-slide-down">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-3 py-1">
                Recent Spaces
              </div>

              {projects.map((proj) => {
                const isSelected = currentProject?._id === proj._id && activeTab !== 'dashboard' && activeTab !== 'admin' && activeTab !== 'roles' && activeTab !== 'teams-management' && !activeTab.startsWith('recycle-bin');
                const canDeleteThisProject = isOrgAdmin || isPM || (proj.leadId && ((proj.leadId._id || proj.leadId).toString() === user?._id?.toString() || (proj.leadId._id || proj.leadId).toString() === (user as any)?.id?.toString()));
                return (
                  <div
                    key={proj._id}
                    onClick={() => handleSelectProject(proj)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left cursor-pointer group ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate min-w-0">
                      <div
                        className="w-6 h-6 min-w-[24px] min-h-[24px] aspect-square rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-2xs"
                        style={{ backgroundColor: proj.color || '#0052CC' }}
                      >
                        {proj.key.charAt(0)}
                      </div>
                      <span className="truncate">{proj.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                      <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-600 bg-slate-100 font-bold'}`}>
                        {proj.key}
                      </span>
                      {canDeleteThisProject && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete(proj);
                          }}
                          title="Move Space to Recycle Bin (30-day retention)"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {projects.length === 0 && (
                <div className="text-[11px] text-slate-400 italic px-3 py-1.5">
                  No spaces yet
                </div>
              )}

              {canCreateProject && (
                <button
                  onClick={onOpenNewProject}
                  className="flex items-center gap-2 px-3 py-2 mt-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer group"
                >
                  <div className="w-4 h-4 rounded border border-dashed border-slate-300 group-hover:border-blue-500 flex items-center justify-center transition-colors">
                    <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-600" />
                  </div>
                  <span>Create space</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 5. ORGANIZATION (For Org Admins) or PROJECT TEAM (For Project Managers) */}
        {(isOrgAdmin || isPM) && (
          <div className="pt-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
              {isOrgAdmin ? 'Organization' : 'Project Team'}
            </div>

            <div className="flex flex-col gap-0.5 mt-0.5">
              {/* Members */}
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                  activeTab === 'admin'
                    ? 'bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className={`w-4 h-4 ${activeTab === 'admin' ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'}`} />
                  <span>{isOrgAdmin ? 'Members & Invites' : 'Project Members'}</span>
                </div>
                {activeTab === 'admin' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
              </button>

              {/* Roles & Tab Permissions - STRICTLY Org Admins only */}
              {canAccessRoles && (
                <button
                  onClick={() => setActiveTab('roles')}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    activeTab === 'roles'
                      ? 'bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className={`w-4 h-4 ${activeTab === 'roles' ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'}`} />
                    <span>Roles & Permissions</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                    RBAC
                  </span>
                </button>
              )}

              {/* Teams Management */}
              {canAccessTeams && (
                <button
                  onClick={() => setActiveTab('teams-management')}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    activeTab === 'teams-management'
                      ? 'bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600'
                      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className={`w-4 h-4 ${activeTab === 'teams-management' ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-800'}`} />
                    <span>Teams</span>
                  </div>
                  {activeTab === 'teams-management' && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 6. DEDICATED RECYCLE BIN / 30-DAY RETENTION SECTION */}
        {canAccessRecycleBin && (
          <div className="pt-3 border-t border-slate-200 mt-2">
            <div className="flex items-center justify-between px-3 py-1 text-slate-500">
              <div className="flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Recycle Bin
                </span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full">
                  30d
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRecycleBinOpen(!recycleBinOpen)}
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                {recycleBinOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {recycleBinOpen && (
              <div className="flex flex-col gap-0.5 mt-1">
                {/* All Recycled Items */}
                <button
                  onClick={() => setActiveTab('recycle-bin')}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    activeTab === 'recycle-bin'
                      ? 'bg-amber-50 text-amber-900 font-bold border-l-2 border-amber-600'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Trash2 className={`w-3.5 h-3.5 ${activeTab === 'recycle-bin' ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span>All Deleted Items</span>
                  </div>
                </button>

                {/* Deleted Tasks */}
                <button
                  onClick={() => setActiveTab('recycle-bin-tasks')}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    activeTab === 'recycle-bin-tasks'
                      ? 'bg-blue-50 text-blue-900 font-bold border-l-2 border-blue-600'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <CheckSquare className={`w-3.5 h-3.5 ${activeTab === 'recycle-bin-tasks' ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span>Deleted Tasks</span>
                  </div>
                </button>

                {/* Deleted Spaces / Projects (Admins & PMs only) */}
                {(isOrgAdmin || isPM) && (
                  <button
                    onClick={() => setActiveTab('recycle-bin-projects')}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                      activeTab === 'recycle-bin-projects'
                        ? 'bg-purple-50 text-purple-900 font-bold border-l-2 border-purple-600'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderKanban className={`w-3.5 h-3.5 ${activeTab === 'recycle-bin-projects' ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      <span>Deleted Spaces</span>
                    </div>
                  </button>
                )}

                {/* Deleted Requests */}
                <button
                  onClick={() => setActiveTab('recycle-bin-requests')}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                    activeTab === 'recycle-bin-requests'
                      ? 'bg-amber-50 text-amber-900 font-bold border-l-2 border-amber-600'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <HelpCircle className={`w-3.5 h-3.5 ${activeTab === 'recycle-bin-requests' ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    <span>Deleted Requests</span>
                  </div>
                </button>

                {/* Deleted Teams (Org Admins only) */}
                {isOrgAdmin && (
                  <button
                    onClick={() => setActiveTab('recycle-bin-teams')}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer group ${
                      activeTab === 'recycle-bin-teams'
                        ? 'bg-emerald-50 text-emerald-900 font-bold border-l-2 border-emerald-600'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Layers className={`w-3.5 h-3.5 ${activeTab === 'recycle-bin-teams' ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                      <span>Deleted Teams</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer System Status & Attribution */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Outdid Sync Active
          </span>
          <span className="font-mono text-slate-600 text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">v1.0</span>
        </div>
        <div className="text-xs text-slate-500 leading-tight">
          <span>© 2026 Outdid Sync · </span>
          <a
            href="https://outdidunified.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-700 font-semibold hover:text-blue-600 transition-colors"
          >
            Built by Outdid
          </a>
        </div>
      </div>

      {/* Delete Space Modal */}
      {projectToDelete && (
        <DeleteConfirmModal
          isOpen={!!projectToDelete}
          onClose={() => setProjectToDelete(null)}
          onConfirm={handleDeleteProject}
          title="Move Space to Recycle Bin?"
          itemName={projectToDelete.name}
          itemType="Project"
          cascadeWarning="All tasks, sprints, and request intake records belonging to this space will also be moved to the Recycle Bin. You can restore them together at any time within 30 days."
          isLoading={isDeletingProject}
        />
      )}
    </aside>
  );
};
