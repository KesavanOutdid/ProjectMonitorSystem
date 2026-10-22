'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { getSocket } from '../lib/socket';
import { broadcastSyncEvent, subscribeCrossTabSync } from '../lib/crossTabSync';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import {
  Trash2,
  RotateCcw,
  Search,
  RefreshCw,
  AlertTriangle,
  FolderKanban,
  CheckSquare,
  HelpCircle,
  Layers,
  Clock,
  User,
  ShieldAlert,
  ArrowUpRight,
  Filter
} from 'lucide-react';

interface RecycledItem {
  _id: string;
  type: 'TASK' | 'PROJECT' | 'REQUEST' | 'TEAM';
  itemType?: 'TASK' | 'PROJECT' | 'REQUEST' | 'TEAM';
  title: string;
  key?: string;
  description?: string;
  deletedAt: string;
  purgeAt: string;
  daysRemaining: number;
  deletedBy?: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  context?: {
    projectId?: string;
    projectName?: string;
    cascadeFrom?: string;
  };
  details?: Record<string, any>;
}

interface RecycleBinViewProps {
  initialTab?: 'ALL' | 'TASK' | 'PROJECT' | 'REQUEST' | 'TEAM';
}

const getItemType = (item: any): 'TASK' | 'PROJECT' | 'REQUEST' | 'TEAM' => {
  return ((item?.type || item?.itemType || 'TASK') as string).toUpperCase() as any;
};

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({ initialTab = 'ALL' }) => {
  const { user, currentWorkspace, fetchProjects } = useAuthStore();
  const [items, setItems] = useState<RecycledItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'TASK' | 'PROJECT' | 'REQUEST' | 'TEAM'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Modal states for permanent purge
  const [purgeTarget, setPurgeTarget] = useState<RecycledItem | null>(null);
  const [isEmptyingBin, setIsEmptyingBin] = useState<boolean>(false);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  const isOrgAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isPM = user?.role === 'PROJECT_MANAGER';
  const isLead = user?.role === 'TEAM_LEAD';

  // Available tabs tailored to the user's role (Org Admin = All, PM = Spaces+Tasks+Requests, Member = Tasks+Requests)
  const visibleTabs = useMemo(() => {
    const list: Array<{ id: 'ALL' | 'TASK' | 'PROJECT' | 'REQUEST' | 'TEAM'; label: string }> = [
      { id: 'ALL', label: 'All Items' },
      { id: 'TASK', label: 'Tasks' }
    ];
    if (isOrgAdmin || isPM) {
      list.push({ id: 'PROJECT', label: 'Spaces / Projects' });
    }
    list.push({ id: 'REQUEST', label: 'Requests' });
    if (isOrgAdmin) {
      list.push({ id: 'TEAM', label: 'Teams' });
    }
    return list;
  }, [isOrgAdmin, isPM]);

  // Fallback to 'ALL' if activeTab is not allowed for the user's role
  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab)) {
      setActiveTab('ALL');
    }
  }, [visibleTabs, activeTab]);

  // Fetch Recycle Bin items (Always fetch ALL items so tab counters and client filtering stay intact)
  const fetchRecycleBin = useCallback(async () => {
    if (!currentWorkspace?._id) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get('/recycle-bin', {
        params: {
          workspaceId: currentWorkspace._id,
          type: 'ALL'
        }
      });
      if (res.data?.success) {
        const rawList = res.data.data || [];
        const normalized: RecycledItem[] = rawList.map((item: any) => {
          const type = getItemType(item);
          return {
            ...item,
            type,
            itemType: type,
            context: item.context || {
              projectId: item.project?._id || item.projectId?._id,
              projectName: item.project?.name || item.projectId?.name,
              cascadeFrom: item.deleteContext?.cascadeFrom
            }
          };
        });
        setItems(normalized);
      }
    } catch (err: any) {
      console.error('Failed to load recycle bin items:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to load recycle bin items');
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace?._id]);

  useEffect(() => {
    fetchRecycleBin();
  }, [fetchRecycleBin]);

  // Multi-Tab & Real-Time Reflection: Re-fetch automatically whenever an item is deleted/restored in other tabs
  useEffect(() => {
    // 1. Cross-tab BroadcastChannel & Storage events
    const unsubscribe = subscribeCrossTabSync((msg) => {
      if (
        msg.type === 'TASK_DELETED' ||
        msg.type === 'TASK_RESTORED' ||
        msg.type === 'PROJECT_DELETED' ||
        msg.type === 'PROJECT_RESTORED' ||
        msg.type === 'RECYCLE_BIN_CHANGED'
      ) {
        fetchRecycleBin();
      }
    });

    // 2. Custom window event from page.tsx or local actions
    const handleWorkspaceRefresh = () => {
      fetchRecycleBin();
    };
    window.addEventListener('outdid:workspace-refresh', handleWorkspaceRefresh);
    window.addEventListener('workspace-sync-required', handleWorkspaceRefresh);

    // 3. Backend WebSockets global events
    const s = getSocket();
    s.on('task:deleted', handleWorkspaceRefresh);
    s.on('task:restored', handleWorkspaceRefresh);
    s.on('project:deleted', handleWorkspaceRefresh);
    s.on('project:restored', handleWorkspaceRefresh);
    s.on('recycle-bin:changed', handleWorkspaceRefresh);

    return () => {
      unsubscribe();
      window.removeEventListener('outdid:workspace-refresh', handleWorkspaceRefresh);
      window.removeEventListener('workspace-sync-required', handleWorkspaceRefresh);
      s.off('task:deleted', handleWorkspaceRefresh);
      s.off('task:restored', handleWorkspaceRefresh);
      s.off('project:deleted', handleWorkspaceRefresh);
      s.off('project:restored', handleWorkspaceRefresh);
      s.off('recycle-bin:changed', handleWorkspaceRefresh);
    };
  }, [fetchRecycleBin]);

  // Toast auto-dismiss
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Handle Restore
  const handleRestore = async (item: RecycledItem) => {
    try {
      setIsActionLoading(true);
      const itemType = getItemType(item);
      const res = await api.post(`/recycle-bin/${itemType.toLowerCase()}/${item._id}/restore`, {
        itemType,
        itemId: item._id
      });
      if (res.data?.success) {
        setSuccessToast(`Successfully restored "${item.title}"`);
        if (itemType === 'PROJECT') {
          // If a space/project is restored, also clear out its cascaded tasks from recycle bin view
          setItems((prev) => prev.filter((i) => i._id !== item._id && i.context?.projectId !== item._id));
        } else {
          setItems((prev) => prev.filter((i) => i._id !== item._id));
        }
        if (currentWorkspace?._id) {
          fetchProjects(currentWorkspace._id);
        }
        // Broadcast to other tabs & windows
        broadcastSyncEvent(itemType === 'PROJECT' ? 'PROJECT_RESTORED' : 'TASK_RESTORED', {
          itemId: item._id,
          itemType
        });
        window.dispatchEvent(new CustomEvent('workspace-sync-required'));
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to restore item');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Permanent Purge
  const handlePurgeConfirm = async () => {
    if (!purgeTarget) return;
    try {
      setIsActionLoading(true);
      const itemType = getItemType(purgeTarget);
      const res = await api.delete(`/recycle-bin/${itemType.toLowerCase()}/${purgeTarget._id}/purge`, {
        data: { itemType, itemId: purgeTarget._id }
      });
      if (res.data?.success) {
        setSuccessToast(`Permanently deleted "${purgeTarget.title}"`);
        if (itemType === 'PROJECT') {
          setItems((prev) => prev.filter((i) => i._id !== purgeTarget._id && i.context?.projectId !== purgeTarget._id));
        } else {
          setItems((prev) => prev.filter((i) => i._id !== purgeTarget._id));
        }
        broadcastSyncEvent('RECYCLE_BIN_CHANGED', { action: 'PURGE', itemId: purgeTarget._id });
        setPurgeTarget(null);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to permanently delete item');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Empty All
  const handleEmptyBinConfirm = async () => {
    if (!currentWorkspace?._id) return;
    try {
      setIsActionLoading(true);
      const res = await api.delete('/recycle-bin/empty', {
        params: { workspaceId: currentWorkspace._id }
      });
      if (res.data?.success) {
        setSuccessToast('Recycle bin permanently emptied.');
        setItems([]);
        broadcastSyncEvent('RECYCLE_BIN_CHANGED', { action: 'EMPTY' });
        setIsEmptyingBin(false);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to empty recycle bin');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Counts by item type
  const counts = useMemo(() => {
    const c = { ALL: items.length, TASK: 0, PROJECT: 0, REQUEST: 0, TEAM: 0 };
    items.forEach((item) => {
      const t = getItemType(item);
      if (c[t] !== undefined) {
        c[t]++;
      }
    });
    return c;
  }, [items]);

  // Filtered Items by search and tab
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const itemType = getItemType(item);
      if (activeTab !== 'ALL' && itemType !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesKey = item.key?.toLowerCase().includes(q);
        const matchesProject = item.context?.projectName?.toLowerCase().includes(q);
        return matchesTitle || matchesKey || matchesProject;
      }
      return true;
    });
  }, [items, activeTab, searchQuery]);

  // Type styling helpers
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'TASK':
        return {
          label: 'Task',
          icon: CheckSquare,
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
        };
      case 'PROJECT':
        return {
          label: 'Space / Project',
          icon: FolderKanban,
          badgeClass: 'bg-purple-50 text-purple-700 border-purple-200'
        };
      case 'REQUEST':
        return {
          label: 'Request',
          icon: HelpCircle,
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
        };
      case 'TEAM':
        return {
          label: 'Team',
          icon: Layers,
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      default:
        return {
          label: type,
          icon: Trash2,
          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200'
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/60 overflow-hidden select-none">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl text-xs font-semibold animate-in slide-in-from-top-4 duration-200 border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Banner / Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-2xs shrink-0">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Recycle Bin
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${
                  isOrgAdmin
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : isPM
                    ? 'bg-blue-50 text-blue-900 border-blue-300'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                }`}>
                  <span>{isOrgAdmin ? 'Workspace Scope (Admin)' : isPM ? 'Project Scope (PM)' : 'Personal Scope (My Deletions)'}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 hidden sm:inline-flex">
                  30-Day Retention
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                {isOrgAdmin ? (
                  <>Deleted items across the entire workspace are safely preserved for <strong>30 days</strong>. Organization Admins can restore items or permanently purge them.</>
                ) : isPM ? (
                  <>Deleted tasks and spaces for your assigned projects and your personal deletions are preserved for <strong>30 days</strong>. You can restore them back to active spaces.</>
                ) : (
                  <>Tasks and requests deleted by you are preserved for <strong>30 days</strong>. You can restore them back to active spaces at any time.</>
                )}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <button
              onClick={fetchRecycleBin}
              disabled={isLoading}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all border border-slate-200 bg-white shadow-2xs cursor-pointer"
              title="Refresh Recycle Bin"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {isOrgAdmin && items.length > 0 && (
              <button
                onClick={() => setIsEmptyingBin(true)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>Empty Trash</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Navigation & Search Bar */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
          {/* Role-scoped Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {visibleTabs.map((tab) => {
              const count = counts[tab.id as keyof typeof counts] || 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-slate-700 text-slate-100' : 'bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, key, or space..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-500" />
            <p className="text-xs font-semibold">Loading Recycle Bin items...</p>
          </div>
        ) : errorMsg ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 text-center px-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mb-3 shadow-2xs">
              <Trash2 className="w-8 h-8 opacity-40" />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Recycle Bin is Empty</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
              {searchQuery
                ? 'No recycled items match your search criteria.'
                : 'No items have been deleted in this workspace. Deleted items will be held here safely for 30 days.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredItems.map((item) => {
              const badge = getTypeBadge(item.type);
              const BadgeIcon = badge.icon;
              const isCascaded = item.context?.cascadeFrom === 'PROJECT';

              return (
                <div
                  key={`${item.type}-${item._id}`}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  {/* Left info column */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <BadgeIcon className="w-5 h-5 text-slate-600" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        {/* Type badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${badge.badgeClass}`}
                        >
                          <BadgeIcon className="w-3 h-3" />
                          <span>{badge.label}</span>
                        </span>

                        {/* Item Key */}
                        {item.key && (
                          <span className="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {item.key}
                          </span>
                        )}

                        {/* Project / Space Context */}
                        {item.context?.projectName && (
                          <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                            <span>in</span>
                            <span className="text-slate-800 font-bold">
                              {item.context.projectName}
                            </span>
                          </span>
                        )}

                        {/* Cascade tag */}
                        {isCascaded && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">
                            Cascaded from Space
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h4 className="text-sm font-bold text-slate-900 truncate">
                        {item.title}
                      </h4>

                      {/* Meta footer */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                        {/* Deleted By */}
                        <div className="flex items-center gap-1.5">
                          {item.deletedBy?.avatar ? (
                            <img
                              src={item.deletedBy.avatar}
                              alt={item.deletedBy.name}
                              className="w-4 h-4 rounded-full object-cover"
                            />
                          ) : (
                            <User className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>
                            Deleted by{' '}
                            <strong className="text-slate-700 font-semibold">
                              {item.deletedBy?.name || 'Workspace Member'}
                            </strong>
                          </span>
                        </div>

                        {/* Deleted Date */}
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {new Date(item.deletedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {/* Days Remaining Countdown */}
                        <div
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            item.daysRemaining <= 7
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          <span>⏳</span>
                          <span>
                            {item.daysRemaining} {item.daysRemaining === 1 ? 'day' : 'days'} left
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-auto border-t md:border-t-0 pt-2 md:pt-0 border-slate-100">
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={isActionLoading}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer group/btn"
                    >
                      <RotateCcw className="w-3.5 h-3.5 transition-transform group-hover/btn:-rotate-45" />
                      <span>Restore</span>
                    </button>

                    {isOrgAdmin && (
                      <button
                        onClick={() => setPurgeTarget(item)}
                        disabled={isActionLoading}
                        className="flex items-center gap-1 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Permanent Purge Confirmation Modal */}
      {purgeTarget && (
        <DeleteConfirmModal
          isOpen={!!purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onConfirm={handlePurgeConfirm}
          title="Delete Permanently?"
          itemName={purgeTarget.title}
          itemType={
            purgeTarget.type === 'TASK'
              ? 'Task'
              : purgeTarget.type === 'PROJECT'
              ? 'Project'
              : purgeTarget.type === 'REQUEST'
              ? 'Request'
              : 'Team'
          }
          isPermanent={true}
          cascadeWarning={
            purgeTarget.type === 'PROJECT'
              ? 'Permanently deleting this space will also permanently erase all of its tasks, sprints, and request intake records.'
              : undefined
          }
          isLoading={isActionLoading}
        />
      )}

      {/* Empty Entire Trash Modal */}
      {isEmptyingBin && (
        <DeleteConfirmModal
          isOpen={isEmptyingBin}
          onClose={() => setIsEmptyingBin(false)}
          onConfirm={handleEmptyBinConfirm}
          title="Empty Entire Recycle Bin?"
          itemName="All recycled tasks, projects, requests, and teams"
          itemType="Item"
          isPermanent={true}
          cascadeWarning="This will permanently delete all items in the Recycle Bin immediately before their 30-day retention period. This action cannot be reversed."
          isLoading={isActionLoading}
        />
      )}
    </div>
  );
};
