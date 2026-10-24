'use client';

import React, { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';
import api from '../lib/api';
import { TaskListRowSkeleton } from './Skeletons';
import {
  Filter,
  ArrowUpDown,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { broadcastSyncEvent } from '../lib/crossTabSync';

interface InfiniteTaskListProps {
  projectId: string;
  onSelectTask: (task: any) => void;
  searchQuery?: string;
}

export const InfiniteTaskList: React.FC<InfiniteTaskListProps> = ({
  projectId,
  onSelectTask,
  searchQuery = ''
}) => {
  const { ref, inView } = useInView();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [taskToDelete, setTaskToDelete] = useState<any | null>(null);

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await api.delete(`/tasks/${taskId}`);
      return res.data;
    },
    onSuccess: () => {
      broadcastSyncEvent('TASK_DELETED', { taskId: taskToDelete?._id, projectId });
      queryClient.invalidateQueries({ queryKey: ['infinite-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setTaskToDelete(null);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || 'Failed to move task to Recycle Bin');
      setTaskToDelete(null);
    }
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isFetching
  } = useInfiniteQuery({
    queryKey: ['infinite-tasks', projectId, searchQuery],
    queryFn: async ({ pageParam = '' }) => {
      let url = `/tasks?limit=15`;
      if (projectId) url += `&projectId=${projectId}`;
      if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
      if (pageParam) url += `&cursor=${pageParam}`;

      const res = await api.get(url);
      return res.data;
    },
    initialPageParam: '',
    getNextPageParam: (lastPage) => {
      return lastPage?.meta?.nextCursor || undefined;
    },
    enabled: true
  });

  // Autoload next page when scroll bottom comes into view
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allTasks = data?.pages.flatMap((page) => page.data) || [];
  const latestMeta = data?.pages[0]?.meta;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE': return 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30';
      case 'IN_PROGRESS': return 'bg-[#0F172A]/10 text-[#0F172A] border-[#0F172A]/20';
      case 'IN_REVIEW': return 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30';
      case 'TODO': return 'bg-[#F3F4F6] text-[#111827] border-[#0F172A]/10';
      default: return 'bg-[#F3F4F6] text-[#0F172A]/70 border-[#0F172A]/10';
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-[#0F172A]/10 p-6 shadow-sm">
      {/* Header with 5ms Index Metric */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#0F172A]/10 gap-3">
        <div>
          <h2 className="text-sm font-bold text-[#111827] flex items-center gap-2">
            <span>High-Speed Infinite Task Feed</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2.5 py-0.5 rounded-full font-bold">
              <Clock className="w-3 h-3 text-[#22C55E]" />
              {latestMeta?.executionTime || '< 3ms'} Index Latency
            </span>
          </h2>
          <p className="text-xs text-[#0F172A]/60 mt-0.5 font-medium">
            Cursor-paginated query stream backed by MongoDB compound indexes and Redis cache.
          </p>
        </div>

        <div className="text-xs font-bold text-[#0F172A] bg-[#F3F4F6] px-3.5 py-1.5 rounded-xl border border-[#0F172A]/10 self-start sm:self-auto">
          Loaded: <span className="text-[#0F172A] font-extrabold">{allTasks.length}</span> issues
        </div>
      </div>

      {/* Task List */}
      <div className="mt-4 flex flex-col gap-2">
        {isLoading && (
          <div>
            {[1, 2, 3, 4, 5].map((n) => (
              <TaskListRowSkeleton key={n} />
            ))}
          </div>
        )}

        {allTasks.map((task: any) => (
          <div
            key={task._id}
            onClick={() => onSelectTask(task)}
            className="flex items-center justify-between p-3.5 bg-white hover:bg-[#F3F4F6]/70 border border-[#0F172A]/10 hover:border-[#0F172A]/30 rounded-xl transition-all cursor-pointer group shadow-xs"
          >
            {/* Left: Key & Title */}
            <div className="flex items-center gap-3.5 flex-1 min-w-0 pr-4">
              <span className="font-mono text-xs font-bold text-[#0F172A] bg-[#F3F4F6] px-2.5 py-1 rounded-lg border border-[#0F172A]/15 flex-shrink-0 group-hover:bg-[#0F172A] group-hover:text-white transition-all">
                {task.key}
              </span>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-[#111827] truncate group-hover:text-[#0F172A] transition-colors">
                  {task.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#0F172A]/50 font-medium">
                  <span>Type: <strong className="text-[#111827]">{task.issueType}</strong></span>
                  <span>•</span>
                  <span>Priority: <strong className="text-[#111827]">{task.priority}</strong></span>
                  {task.team && (
                    <>
                      <span>•</span>
                      <span>Team: <strong className="text-[#111827]">{task.team}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Status Pill & Assignee */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${getStatusColor(task.status)}`}>
                {task.status.replace('_', ' ')}
              </span>

              {task.assigneeId ? (
                <div
                  title={`Assigned: ${task.assigneeId.name}`}
                  className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full shadow-2xs"
                >
                  <div className="w-5 h-5 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                    {task.assigneeId.name.charAt(0)}
                  </div>
                  <span className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">
                    {task.assigneeId.name}
                  </span>
                </div>
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#F3F4F6] text-[#0F172A]/40 border border-[#0F172A]/10 flex items-center justify-center text-[10px] font-bold">
                  -
                </div>
              )}

              {/* Delete on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTaskToDelete(task);
                }}
                title="Move to Recycle Bin (30-day retention)"
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <ChevronRight className="w-4 h-4 text-[#0F172A]/40 group-hover:text-[#0F172A] group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        ))}

        {/* Bottom Autoload Trigger with Animation */}
        <div ref={ref} className="py-6 flex items-center justify-center">
          {isFetchingNextPage ? (
            <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A] bg-[#F3F4F6] px-4 py-2 rounded-full border border-[#0F172A]/15 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-ping" />
              Autoloading next records via cursor stream...
            </div>
          ) : hasNextPage ? (
            <div className="text-xs font-medium text-[#0F172A]/50">
              Scroll down to stream more issues
            </div>
          ) : allTasks.length > 0 ? (
            <div className="text-xs font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-4 py-1.5 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>All {allTasks.length} issues streamed into memory</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <DeleteConfirmModal
          isOpen={!!taskToDelete}
          onClose={() => setTaskToDelete(null)}
          onConfirm={() => deleteTaskMutation.mutateAsync(taskToDelete._id)}
          title="Move Task to Recycle Bin?"
          itemName={`${taskToDelete.key ? `[${taskToDelete.key}] ` : ''}${taskToDelete.title}`}
          itemType="Task"
          isLoading={deleteTaskMutation.isPending}
        />
      )}
    </div>
  );
};
