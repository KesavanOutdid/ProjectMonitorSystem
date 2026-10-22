'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  Layers,
  Calendar,
  Clock,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  RefreshCw
} from 'lucide-react';
import { ExcelImportModal } from './ExcelImportModal';
import { downloadProjectExcel } from '../lib/excelExport';

interface TimelineViewProps {
  projectId: string;
  onSelectTask: (task: any) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  projectId,
  onSelectTask
}) => {
  const [isExcelImportOpen, setIsExcelImportOpen] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleExportToExcel = async () => {
    try {
      setIsExportingExcel(true);
      await downloadProjectExcel({
        projectId,
        scope: 'all',
        startTaskNumber: 1
      });
    } catch (err) {
      console.error('Failed to export timeline tasks:', err);
      alert('Failed to export timeline tasks. Please try again.');
    } finally {
      setIsExportingExcel(false);
    }
  };
  const { data: sprints = [], isLoading: isLoadingSprints } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/sprints`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['timeline-tasks', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/tasks?projectId=${projectId}&limit=50`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  if (isLoadingSprints || isLoadingTasks) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-20 bg-slate-800/40 rounded-2xl border border-slate-700/50" />
        <div className="h-64 bg-slate-800/40 rounded-2xl border border-slate-700/50" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-[#111827]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#111827] tracking-tight">Project Roadmap & Timeline</h2>
          <p className="text-xs text-[#111827]/60">
            Sprint cadence milestones, delivery schedules, and work progression.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExcelImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-[0.98]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            <span>Import Project Plan</span>
          </button>
          <button
            onClick={handleExportToExcel}
            disabled={isExportingExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer hover:shadow-xs active:scale-[0.98] disabled:opacity-50"
          >
            {isExportingExcel ? (
              <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-white" />
            )}
            <span>{isExportingExcel ? 'Exporting...' : 'Export Project Plan'}</span>
          </button>
        </div>
      </div>

      {/* Sprints Timeline Roadmap */}
      <div className="bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
        <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#0F172A]" />
          <span>Sprint Milestones</span>
        </h3>

        <div className="flex flex-col gap-3">
          {sprints.map((s: any, idx: number) => {
            const startDate = new Date(s.startDate || s.createdAt).toLocaleDateString();
            const endDate = new Date(s.endDate || Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString();

            return (
              <div
                key={s._id}
                className="p-3.5 bg-[#F3F4F6]/80 border border-[#0F172A]/10 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs">
                    S{idx + 1}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#111827]">{s.name}</div>
                    <div className="text-xs text-slate-500 font-medium">
                      {startDate} — {endDate}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="flex-1 sm:w-48">
                    <div className="flex items-center justify-between text-xs text-[#111827]/70 font-bold mb-1">
                      <span>{s.stats?.completedTasks || 0} / {s.stats?.totalTasks || 0} issues</span>
                      <span>{s.stats?.percentComplete || 0}%</span>
                    </div>
                    <div className="h-2 w-full bg-white rounded-full overflow-hidden border border-[#0F172A]/10">
                      <div
                        className="h-full bg-[#22C55E] rounded-full transition-all"
                        style={{ width: `${s.stats?.percentComplete || 0}%` }}
                      />
                    </div>
                  </div>

                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                      s.status === 'ACTIVE'
                        ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30'
                        : s.status === 'COMPLETED'
                        ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30'
                        : 'bg-[#F3F4F6] text-[#111827]/70 border-[#0F172A]/10'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task Gantt Progress Bars */}
      <div className="bg-white/95 backdrop-blur-md border border-[#0F172A]/10 rounded-2xl p-5 shadow-xs flex flex-col gap-3">
        <h3 className="text-base font-bold text-[#111827] flex items-center gap-2">
          <Layers className="w-4.5 h-4.5 text-[#0F172A]" />
          <span>Active Issues Schedule</span>
        </h3>

        <div className="divide-y divide-[#0F172A]/10">
          {tasks.slice(0, 10).map((t: any) => (
            <div
              key={t._id}
              onClick={() => onSelectTask(t)}
              className="py-2.5 flex items-center justify-between gap-4 hover:bg-[#F3F4F6]/70 px-2 rounded-xl transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono text-xs font-bold text-[#0F172A]">[{t.key}]</span>
                <span className="text-xs sm:text-sm font-semibold text-[#111827] truncate">{t.title}</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-bold text-[#111827]/80 bg-[#F3F4F6] px-2.5 py-1 rounded-lg border border-[#0F172A]/10">
                  {t.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Excel Timeline & Project Plan Import Modal */}
      {isExcelImportOpen && typeof document !== 'undefined' && createPortal(
        <ExcelImportModal
          isOpen={isExcelImportOpen}
          onClose={() => setIsExcelImportOpen(false)}
          projectId={projectId}
        />,
        document.body
      )}
    </div>
  );
};
