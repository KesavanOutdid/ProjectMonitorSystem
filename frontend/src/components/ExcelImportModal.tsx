'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import * as XLSX from 'xlsx';
import {
  X,
  FileSpreadsheet,
  UploadCloud,
  Download,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Layers,
  CheckSquare,
  BookmarkCheck,
  Bug,
  RefreshCw,
  Clock,
  Sparkles,
  Info,
  CornerDownRight,
  GitBranch,
  Target,
  Search,
  Check
} from 'lucide-react';
import { downloadProjectExcel } from '../lib/excelExport';
import { useAuthStore } from '../store/authStore';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  projectKey?: string;
  defaultSprintName?: string;
  defaultTeam?: string;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectKey = 'PRJ',
  defaultSprintName,
  defaultTeam
}) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const { user } = useAuthStore();
  const isLevel1 = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN';
  const isLevel2 = user?.role === 'PROJECT_MANAGER';
  const isLevel3 = user?.role === 'TEAM_LEAD';
  const canImportExcel = isLevel1 || isLevel2 || isLevel3;

  const [step, setStep] = useState<'upload' | 'preview' | 'success'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [defaultCycleDays, setDefaultCycleDays] = useState<number>(14);
  const [defaultStartDate, setDefaultStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [previewData, setPreviewData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Search & Type Filter inside preview table
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'MAIN' | 'SUBTASK' | 'VALID' | 'INVALID'>('ALL');

  // Reset scroll position on opening preview
  useEffect(() => {
    if (step === 'preview' && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = 0;
      tableContainerRef.current.scrollTop = 0;
    }
  }, [step, previewData]);

  // Press ESC to exit full page import
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Mutation: Generate Preview
  const previewMutation = useMutation({
    mutationFn: async (fileToUpload: File) => {
      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('defaultCycleDays', defaultCycleDays.toString());
      formData.append('defaultStartDate', defaultStartDate);
      if (defaultSprintName) formData.append('defaultSprintName', defaultSprintName);
      if (defaultTeam) formData.append('defaultTeam', defaultTeam);

      const res = await api.post(`/projects/${projectId}/import-excel/preview`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setStep('preview');
      setErrorMessage(null);
      setSearchTerm('');
      setFilterType('ALL');
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error || 'Failed to parse Excel file. Please verify file format.');
    }
  });

  const [importResult, setImportResult] = useState<any>(null);

  // Mutation: Execute Bulk Import
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected');
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('defaultCycleDays', defaultCycleDays.toString());
      formData.append('defaultStartDate', defaultStartDate);
      if (defaultSprintName) formData.append('defaultSprintName', defaultSprintName);
      if (defaultTeam) formData.append('defaultTeam', defaultTeam);

      const res = await api.post(`/projects/${projectId}/import-excel/execute`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project-sprints', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-all-tasks', projectId] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectId] });
      queryClient.invalidateQueries({ queryKey: ['timeline-tasks', projectId] });
      setImportResult(data?.data || null);
      setStep('success');
    },
    onError: (err: any) => {
      setErrorMessage(err.response?.data?.error || 'Failed to complete import.');
    }
  });

  // Filtered tasks for preview table
  const filteredTasks = useMemo(() => {
    if (!previewData?.preparedTasks) return [];
    let list = previewData.preparedTasks;
    if (filterType === 'MAIN') {
      list = list.filter((t: any) => !t.isSubtask && !t.isMinitask && !t.isMicrotask);
    } else if (filterType === 'SUBTASK') {
      list = list.filter((t: any) => t.isSubtask || t.isMinitask || t.isMicrotask);
    } else if (filterType === 'VALID') {
      list = list.filter((t: any) => t.isValidTeam !== false && t.action !== 'SKIP');
    } else if (filterType === 'INVALID') {
      list = list.filter((t: any) => t.isValidTeam === false || t.action === 'SKIP');
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((t: any) =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.key && t.key.toLowerCase().includes(q)) ||
        (t.team && t.team.toLowerCase().includes(q)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(q)) ||
        (t.phase && t.phase.toLowerCase().includes(q)) ||
        (t.sprintName && t.sprintName.toLowerCase().includes(q)) ||
        (t.parentTitle && t.parentTitle.toLowerCase().includes(q)) ||
        (t.parentKey && t.parentKey.toLowerCase().includes(q))
      );
    }
    return list;
  }, [previewData?.preparedTasks, filterType, searchTerm]);

  if (!isOpen) return null;

  if (!canImportExcel) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-slate-200 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">Access Restricted</h3>
          <p className="text-xs text-slate-500 mb-5 leading-relaxed">
            Excel Import is restricted to <strong>1st 3 Levels only</strong> (Super/Org Admins, Project Managers, and Team Leads). Normal Team Members cannot import Excel project plans.
          </p>
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setErrorMessage(null);
    previewMutation.mutate(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Download Project-Specific Timeline Plan Excel Template with real project dropdowns
  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const response = await api.get(`/projects/${projectId}/import-excel/template`, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${projectKey || 'project'}_timeline_plan_template.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('Backend dynamic template generation failed, falling back to client-side generator:', err);
      try {
        const today = new Date();
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 24 * 60 * 60 * 1000);

        const p1Start = new Date(today);
        const effectivePhase = defaultSprintName || 'Sprint 1';
        const effectiveTeam = defaultTeam && defaultTeam !== 'ALL' ? defaultTeam : '';

        const sampleRows = [
          {
            'S.No': 1,
            'Project': projectName || projectKey || 'Project',
            'Sprint': effectivePhase,
            'Level 1 – Main Task': 'Admin Login',
            'Level 2 – Subtask': 'Design admin login UI',
            'Level 3 – Mini Tasks': 'Create login form layout',
            'Level 4 – Micro Tasks': '',
            'Task Description': 'Design responsive login UI',
            'Duration (Days)': 3,
            'Priority': 'HIGH',
            'Status': 'TODO',
            'Team': effectiveTeam,
            'Assignee': '',
            'Task Key': ''
          },
          {
            'S.No': 2,
            'Project': projectName || projectKey || 'Project',
            'Sprint': effectivePhase,
            'Level 1 – Main Task': 'Admin Login',
            'Level 2 – Subtask': 'Develop login authentication API',
            'Level 3 – Mini Tasks': 'JWT Authentication Service',
            'Level 4 – Micro Tasks': 'Write unit tests for JWT validator',
            'Task Description': 'Check edge cases and token expiry',
            'Duration (Days)': 1,
            'Priority': 'MEDIUM',
            'Status': 'TODO',
            'Team': effectiveTeam,
            'Assignee': '',
            'Task Key': ''
          }
        ];

        const ws = XLSX.utils.json_to_sheet(sampleRows);
        ws['!cols'] = [
          { wch: 10 }, // S.No
          { wch: 24 }, // Project
          { wch: 24 }, // Sprint
          { wch: 34 }, // Level 1 – Main Task
          { wch: 38 }, // Level 2 – Subtask
          { wch: 38 }, // Level 3 – Mini Tasks
          { wch: 38 }, // Level 4 – Micro Tasks
          { wch: 44 }, // Task Description
          { wch: 16 }, // Duration (Days)
          { wch: 14 }, // Priority
          { wch: 16 }, // Status
          { wch: 24 }, // Team
          { wch: 34 }, // Assignee
          { wch: 20 }  // Task Key
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Project Timeline Plan');

        const guideRows = [
          { 'Column': 'Project', 'Required': 'Required', 'Description': `Project Name: ${projectName || projectKey}` },
          { 'Column': 'Sprint', 'Required': 'Optional', 'Description': 'Project Sprint or Phase. If empty, uses Board active sprint or Backlog.' },
          { 'Column': 'Level 1 – Main Task', 'Required': 'Required for Main Task', 'Description': 'Primary deliverable / User Story or feature name.' },
          { 'Column': 'Level 2 – Subtask', 'Required': 'Optional', 'Description': 'Development Subtask under the preceding Main Task.' },
          { 'Column': 'Level 3 – Mini Tasks', 'Required': 'Optional', 'Description': 'Mini-task under the preceding Subtask.' },
          { 'Column': 'Level 4 – Micro Tasks', 'Required': 'Optional', 'Description': 'Micro-task checklist item under the preceding Mini-task.' },
          { 'Column': 'Task Key', 'Required': 'Optional', 'Description': 'Format: PROJECT-TASKTYPE-TEAM-NUMBER. Main Task: R-MT-HE-107 or R-MT-GEN-1. Subtask: R-ST-HE-107-1. Leave blank to auto-create, or specify existing key to UPDATE.' },
          { 'Column': 'Task Description', 'Required': 'Optional', 'Description': 'Detailed specifications, requirements, or acceptance criteria.' },
          { 'Column': 'Duration (Days)', 'Required': 'Optional', 'Description': 'Estimated working days for the activity.' },
          { 'Column': 'Priority & Status', 'Required': 'Optional', 'Description': 'Priority: LOW, MEDIUM, HIGH, URGENT / Status: TODO, IN_PROGRESS, IN_REVIEW, DONE' },
          { 'Column': 'Team & Assignee', 'Required': 'Optional', 'Description': 'Discipline and Owner according to your project.' }
        ];
        const wsGuide = XLSX.utils.json_to_sheet(guideRows);
        wsGuide['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsGuide, 'Timeline Guide');

        XLSX.writeFile(wb, `${projectKey || 'project'}_timeline_plan_template.xlsx`);
      } catch (clientErr) {
        window.open('/project_plan_timeline_template.xlsx', '_blank');
      }
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  // Export all existing project tasks with keys and subtask hierarchy
  const handleExportCurrentTasks = async () => {
    try {
      setIsExporting(true);
      await downloadProjectExcel({ projectId, projectKey });
    } catch (err: any) {
      alert(err.message || 'Failed to export tasks to Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
    setErrorMessage(null);
    setSearchTerm('');
    setFilterType('ALL');
    setStep('upload');
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Urgent</span>;
      case 'HIGH':
        return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">High</span>;
      case 'LOW':
        return <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Low</span>;
      default:
        return <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Medium</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col w-screen h-screen overflow-hidden text-slate-800 animate-in fade-in duration-150">
      
      {/* Top Application Header Bar */}
      <header className="h-14 bg-slate-900 text-white px-4 sm:px-6 flex items-center justify-between shrink-0 border-b border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-all cursor-pointer border border-slate-700"
            title="Return to Board (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Board</span>
          </button>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight">Project Plan & Timeline Excel Import</h1>
                <span className="hidden md:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Full Page View
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {projectKey}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="hidden md:flex items-center text-xs font-semibold">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${step === 'upload' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 'upload' ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}>1</span>
            <span>Upload & Settings</span>
          </div>
          <div className="w-6 h-px bg-slate-700 mx-1" />
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${step === 'preview' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 'preview' ? 'bg-white text-blue-600' : 'bg-slate-800 text-slate-400'}`}>2</span>
            <span>Timeline & Task Preview</span>
          </div>
          <div className="w-6 h-px bg-slate-700 mx-1" />
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${step === 'success' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${step === 'success' ? 'bg-white text-emerald-600' : 'bg-slate-800 text-slate-400'}`}>3</span>
            <span>Confirmation</span>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2.5">
          {step === 'preview' && (
            <button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {executeMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm & Execute Import</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Error banner */}
      {errorMessage && (
        <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-700 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ================= STEP 1: UPLOAD & SETTINGS ================= */}
      {step === 'upload' && (
        <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col items-center justify-center">
          <div className="max-w-4xl w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col gap-6">
            
            {/* Header info inside upload card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Upload Project Timeline Plan</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Import sprints, phases, upper main tasks, subtasks, dependencies, and team allocations from an Excel spreadsheet.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Export Current Tasks button */}
                <button
                  type="button"
                  onClick={handleExportCurrentTasks}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Export all existing tasks and subtasks from this project into Excel"
                >
                  {isExporting ? (
                    <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                  )}
                  <span>{isExporting ? 'Exporting...' : 'Export Current Tasks (.xlsx)'}</span>
                </button>

                {/* Download sample template button */}
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  disabled={isDownloadingTemplate}
                  className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  title="Downloads blank Excel template with project dropdowns"
                >
                  {isDownloadingTemplate ? (
                    <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 text-emerald-600" />
                  )}
                  <span>{isDownloadingTemplate ? 'Generating...' : 'Download Blank Template'}</span>
                </button>
              </div>
            </div>

            {/* Configuration bar */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-5 flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Default Phase/Sprint Duration</span>
                  </label>
                  <select
                    value={defaultCycleDays}
                    onChange={(e) => setDefaultCycleDays(parseInt(e.target.value, 10))}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={7}>1 Week (7 days)</option>
                    <option value={14}>2 Weeks (14 days) - Recommended</option>
                    <option value={21}>3 Weeks (21 days)</option>
                    <option value={28}>4 Weeks (28 days)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>Initial Project Start Date</span>
                  </label>
                  <input
                    type="date"
                    value={defaultStartDate}
                    onChange={(e) => setDefaultStartDate(e.target.value)}
                    className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {(defaultSprintName || defaultTeam) && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-blue-600" />
                      <span>Active Context Defaults</span>
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      {defaultSprintName && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md">
                          Sprint: {defaultSprintName}
                        </span>
                      )}
                      {defaultTeam && defaultTeam !== 'ALL' && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-md">
                          Team: {defaultTeam}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drag and Drop Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
                  : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 shadow-xs">
                <UploadCloud className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                Click to browse or drag & drop your Project Plan Excel file
              </h4>
              <p className="text-xs text-slate-500 max-w-md mb-4">
                Supports Microsoft Excel (<code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">.xlsx</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">.xls</code>) or <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">.csv</code> spreadsheets.
              </p>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Natural Main Task & Subtask hierarchy · Auto Start & End dates · Dependency wiring</span>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800 mb-1">
                  <CornerDownRight className="w-4 h-4 text-indigo-500" />
                  <span>Upper Main Task Hierarchy</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Subtask rows automatically bind to the preceding Main Task. When Main 2 starts, subsequent subtasks bind to Main 2.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800 mb-1">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>Timeline & Duration Engine</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Specify Start Date and Duration (Days) to automatically compute End Dates and phase milestones.
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800 mb-1">
                  <GitBranch className="w-4 h-4 text-emerald-500" />
                  <span>Predecessors & DAG Graph</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Dependencies list predecessor task keys or titles, directly linking into your interactive dependency tree.
                </p>
              </div>
            </div>

            {/* Bottom Actions for upload */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!selectedFile || previewMutation.isPending}
                onClick={() => selectedFile && previewMutation.mutate(selectedFile)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
              >
                {previewMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Project Plan...</span>
                  </>
                ) : (
                  <>
                    <span>Preview Timeline & Tasks</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= STEP 2: FULL PAGE TIMELINE & TASK PREVIEW ================= */}
      {step === 'preview' && previewData && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-100">
          
          {/* Top KPI Metrics Strip */}
          <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 shadow-2xs">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-blue-700">Phases & Sprints</span>
                  <h4 className="text-lg font-bold text-blue-900 mt-0.5">
                    {previewData.summary?.totalSprints || 0}
                  </h4>
                  <span className="text-[10px] text-blue-600">Calculated delivery cycles</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                  <Layers className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-700">Main Tasks</span>
                  <h4 className="text-lg font-bold text-emerald-900 mt-0.5">
                    {previewData.summary?.totalTasks || 0}
                  </h4>
                  <span className="text-[10px] text-emerald-600">
                    +{previewData.summary?.newTasksCount || 0} new, {previewData.summary?.updateTasksCount || 0} update
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckSquare className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3 bg-indigo-50/80 border border-indigo-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-indigo-700">Subtasks</span>
                  <h4 className="text-lg font-bold text-indigo-900 mt-0.5">
                    {previewData.summary?.totalSubtasks || 0}
                  </h4>
                  <span className="text-[10px] text-indigo-600">Nested under upper mains</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <CornerDownRight className="w-4 h-4" />
                </div>
              </div>

              <div className="p-3 bg-purple-50/80 border border-purple-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-purple-700">Total Activities</span>
                  <h4 className="text-lg font-bold text-purple-900 mt-0.5">
                    {previewData.preparedTasks?.length || 0} Items
                  </h4>
                  <span className="text-[10px] text-purple-600">
                    {previewData.summary?.totalTasks || 0} main · {previewData.summary?.totalSubtasks || 0} subtasks
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* Sprints / Phases Timeline horizontal preview */}
            {previewData.preparedSprints && previewData.preparedSprints.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0 flex items-center gap-1.5 mr-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" /> Sprints & Phases:
                </span>
                {previewData.preparedSprints.map((sprint: any, idx: number) => (
                  <div key={idx} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 shrink-0 text-xs">
                    <span className="font-bold text-slate-900">{sprint.name}</span>
                    <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded-full">
                      {sprint.taskCount} tasks
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(sprint.startDate).toLocaleDateString()} to {new Date(sprint.endDate).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Invalid Teams Warning Banner */}
            {previewData.summary?.invalidTasksCount > 0 && (
              <div className="mt-2.5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-rose-900">
                      ⚠️ Team Validation Notice: {previewData.summary.invalidTasksCount} task(s) have teams not configured in this project
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilterType('INVALID')}
                      className="text-[11px] font-bold text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded transition-colors cursor-pointer border border-rose-300"
                    >
                      Filter Skipped Tasks ({previewData.summary.invalidTasksCount})
                    </button>
                  </div>
                  <p className="text-[11px] text-rose-700 mt-1 leading-relaxed">
                    Task IDs are generated <strong>strictly for valid project teams</strong> ({previewData.summary.allowedProjectTeams && previewData.summary.allowedProjectTeams.length > 0 ? previewData.summary.allowedProjectTeams.join(', ') : 'configured project teams'} or General). Tasks with unconfigured teams are marked <span className="font-black text-rose-900 bg-rose-100 px-1 py-0.2 rounded border border-rose-200">⛔ SKIP</span> (no Task ID assigned) and will not be imported. You can add those teams to the project later and re-import.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Table Container Section (takes remaining viewport height!) */}
          <div className="flex-1 min-h-0 px-6 py-3 flex flex-col overflow-hidden">
            
            {/* Table Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Calculated Timeline Activities, Hierarchy & Predecessors</span>
                </h2>
                <span className="text-xs font-bold text-slate-700 bg-slate-200/90 px-2 py-0.5 rounded-md">
                  {filteredTasks.length} {filteredTasks.length === 1 ? 'item' : 'items'}
                </span>

                {/* Filter chips */}
                <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold ml-2">
                  <button
                    onClick={() => setFilterType('ALL')}
                    className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      filterType === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({previewData.preparedTasks?.length || 0})
                  </button>
                  <button
                    onClick={() => setFilterType('MAIN')}
                    className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      filterType === 'MAIN'
                        ? 'bg-white text-emerald-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Main Tasks ({previewData.summary?.totalTasks || 0})
                  </button>
                  <button
                    onClick={() => setFilterType('SUBTASK')}
                    className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      filterType === 'SUBTASK'
                        ? 'bg-white text-indigo-800 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Subtasks ({previewData.summary?.totalSubtasks || 0})
                  </button>
                  <button
                    onClick={() => setFilterType('VALID')}
                    className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                      filterType === 'VALID'
                        ? 'bg-white text-emerald-700 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ✓ Valid ({previewData.summary?.validTasksCount ?? previewData.preparedTasks?.filter((t: any) => t.isValidTeam !== false && t.action !== 'SKIP').length})
                  </button>
                  {previewData.summary?.invalidTasksCount > 0 && (
                    <button
                      onClick={() => setFilterType('INVALID')}
                      className={`px-2.5 py-0.5 rounded-md transition-all cursor-pointer ${
                        filterType === 'INVALID'
                          ? 'bg-white text-rose-700 shadow-2xs font-bold'
                          : 'text-rose-600 hover:text-rose-800'
                      }`}
                    >
                      ⛔ Skipped ({previewData.summary.invalidTasksCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Search input */}
              <div className="relative min-w-[280px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search task title, key, team, assignee..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Dedicated single-scroll table area */}
            <div
              ref={tableContainerRef}
              className="flex-1 min-h-0 overflow-auto border border-slate-200 rounded-xl bg-white shadow-xs scrollbar-thin"
            >
              <table className="w-full min-w-[1300px] text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10 shadow-2xs">
                  <tr>
                    <th className="py-2.5 px-2.5 w-14 text-center whitespace-nowrap text-slate-600 font-bold border-r border-slate-200/80">S.No</th>
                    <th className="py-2.5 px-3 w-20 text-center whitespace-nowrap">Action</th>
                    <th className="py-2.5 px-3 w-24 whitespace-nowrap">Type</th>
                    <th className="py-2.5 px-3 w-36 whitespace-nowrap">Task Key</th>
                    <th className="py-2.5 px-4 min-w-[320px]">Task Title</th>
                    <th className="py-2.5 px-3 w-36 whitespace-nowrap">Phase / Milestone</th>
                    <th className="py-2.5 px-3 w-20 text-center whitespace-nowrap">Duration</th>
                    <th className="py-2.5 px-3 w-28 whitespace-nowrap">Start Date</th>
                    <th className="py-2.5 px-3 w-28 whitespace-nowrap">Due Date</th>
                    <th className="py-2.5 px-3 w-36 whitespace-nowrap">Dependencies</th>
                    <th className="py-2.5 px-3 w-36 whitespace-nowrap">Team</th>
                    <th className="py-2.5 px-3 min-w-[190px] whitespace-nowrap">Assignee</th>
                    <th className="py-2.5 px-3 w-24 text-center whitespace-nowrap">Priority</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        No tasks match the search or filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((t: any, idx: number) => (
                      <tr
                        key={idx}
                        className={
                          t.isValidTeam === false || t.action === 'SKIP'
                            ? 'bg-rose-50/30 hover:bg-rose-50/60 transition-colors'
                            : t.isSubtask
                            ? 'bg-indigo-50/20 hover:bg-indigo-50/50 transition-colors'
                            : 'hover:bg-slate-50 transition-colors'
                        }
                      >
                        {/* Serial Number (S.No) */}
                        <td className="py-2.5 px-2.5 text-center font-mono text-[11px] text-slate-500 font-semibold whitespace-nowrap border-r border-slate-100 bg-slate-50/50 select-none">
                          {idx + 1}
                        </td>

                        {/* Action (NEW vs UPDATE vs SKIP) */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {t.isValidTeam === false || t.action === 'SKIP' ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-300"
                              title={t.teamError || 'Skipped: Team not configured in this project (add team later)'}
                            >
                              <span>⛔</span> SKIP
                            </span>
                          ) : t.action === 'UPDATE' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-sky-100 text-sky-700 border border-sky-300">
                              <span>↺</span> UPDATE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-300">
                              <span>+</span> NEW
                            </span>
                          )}
                        </td>

                        {/* Task Type Badge (Main Task vs Subtask vs Microtask) */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {t.isMicrotask ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              Micro-task
                            </span>
                          ) : t.isMinitask ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                              Mini-task
                            </span>
                          ) : t.isSubtask ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              Subtask
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                              Main Task
                            </span>
                          )}
                        </td>

                        {/* Task Key */}
                        <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                          {t.isValidTeam === false || t.action === 'SKIP' ? (
                            <span
                              className="inline-flex items-center gap-1 text-rose-500 font-semibold italic text-[10px]"
                              title={t.teamError || 'No Task ID assigned: Team is not configured in this project'}
                            >
                              <span>—</span> No ID (Team Error)
                            </span>
                          ) : t.isMicrotask ? (
                            <div className="flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3 text-purple-500 shrink-0" />
                              <span className="font-bold text-purple-700">{t.key}</span>
                            </div>
                          ) : t.isMinitask ? (
                            <div className="flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3 text-teal-500 shrink-0" />
                              <span className="font-bold text-teal-700">{t.key}</span>
                            </div>
                          ) : t.isSubtask ? (
                            <div className="flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span className="font-bold text-indigo-700">{t.key}</span>
                            </div>
                          ) : (
                            <span className="font-bold text-blue-600">{t.key}</span>
                          )}
                        </td>

                        {/* Task Title */}
                        <td className="py-2.5 px-4 min-w-[320px] max-w-[480px]">
                          {t.isMicrotask ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 shrink-0">
                                  ↳ MICRO-TASK
                                </span>
                                <span className="font-semibold text-slate-800 text-xs truncate" title={t.title}>
                                  {t.title}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 truncate">
                                Parent: <span className="font-semibold text-slate-600">{t.parentKey}</span> {t.parentTitle}
                              </span>
                              {t.description && (
                                <span className="text-[10px] text-slate-500 italic truncate" title={t.description}>
                                  {t.description}
                                </span>
                              )}
                            </div>
                          ) : t.isMinitask ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200 shrink-0">
                                  ↳ MINI-TASK
                                </span>
                                <span className="font-semibold text-slate-800 text-xs truncate" title={t.title}>
                                  {t.title}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 truncate">
                                Upper subtask: <span className="font-semibold text-slate-600">{t.parentKey}</span> {t.parentTitle}
                              </span>
                              {t.description && (
                                <span className="text-[10px] text-slate-500 italic truncate" title={t.description}>
                                  {t.description}
                                </span>
                              )}
                            </div>
                          ) : t.isSubtask ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200 shrink-0">
                                  ↳ SUBTASK
                                </span>
                                <span className="font-semibold text-slate-800 text-xs truncate" title={t.title}>
                                  {t.title}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 truncate">
                                Upper main: <span className="font-semibold text-slate-600">{t.parentKey}</span> {t.parentTitle}
                              </span>
                              {t.description && (
                                <span className="text-[10px] text-slate-500 italic truncate" title={t.description}>
                                  {t.description}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-800 text-xs truncate block" title={t.title}>
                                  {t.title}
                                </span>
                                {t.isMilestone && (
                                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[9px] font-black uppercase shrink-0">
                                    Milestone
                                  </span>
                                )}
                              </div>
                              {t.description && (
                                <span className="text-[10px] text-slate-500 italic truncate" title={t.description}>
                                  {t.description}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Phase / Milestone */}
                        <td className="py-2.5 px-3 text-slate-700 font-medium text-[11px] whitespace-nowrap max-w-[150px] truncate" title={t.phase || t.sprintName}>
                          {t.phase || t.sprintName}
                        </td>

                        {/* Duration */}
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 text-center whitespace-nowrap">
                          {t.durationDays ? `${t.durationDays}d` : '—'}
                        </td>

                        {/* Start Date */}
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {new Date(t.startDate).toLocaleDateString()}
                        </td>

                        {/* Due Date */}
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 font-medium whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>{new Date(t.dueDate).toLocaleDateString()}</span>
                          </span>
                        </td>

                        {/* Dependencies / Predecessors */}
                        <td className="py-2.5 px-3 max-w-[150px] whitespace-nowrap">
                          {t.dependencies ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 truncate max-w-full" title={t.dependencies}>
                              <GitBranch className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                              <span className="truncate">{t.dependencies}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">—</span>
                          )}
                        </td>

                        {/* Team */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {t.isValidTeam === false ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-300 whitespace-nowrap"
                              title={t.teamError || 'This team is not configured in this project'}
                            >
                              <span>⚠️</span> {t.team} <span className="font-normal text-[9px] text-rose-500">(Not in Project)</span>
                            </span>
                          ) : t.team ? (
                            <span className="inline-block text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap">
                              {t.team}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">—</span>
                          )}
                        </td>

                        {/* Assignee with Email, Name & Team Member Check */}
                        <td className="py-2.5 px-3 min-w-[190px] whitespace-nowrap">
                          {t.assigneeName ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
                                  {t.assigneeName.charAt(0)}
                                </span>
                                <span className="font-semibold text-slate-800 text-[11px] truncate max-w-[120px]">
                                  {t.assigneeName}
                                </span>
                                {t.isTeamMember === true && (
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 shrink-0" title="Verified team member">
                                    ✓ In Team
                                  </span>
                                )}
                                {t.isTeamMember === false && (
                                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200 shrink-0" title="Not listed as a member of this team">
                                    ⚠️ Other Team
                                  </span>
                                )}
                              </div>
                              {t.assigneeEmail && (
                                <span className="text-[10px] text-slate-400 font-mono pl-5 truncate max-w-[140px]">
                                  {t.assigneeEmail}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">Unassigned (Add later)</span>
                          )}
                        </td>

                        {/* Priority */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {getPriorityBadge(t.priority)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Warnings banner */}
            {previewData.summary?.warnings && previewData.summary.warnings.length > 0 && (
              <div className="mt-2.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 shrink-0">
                <div className="font-bold flex items-center gap-1.5 mb-0.5 text-amber-900">
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  <span>Import Adjustments ({previewData.summary.warnings.length})</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {previewData.summary.warnings.slice(0, 3).map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                  {previewData.summary.warnings.length > 3 && (
                    <li className="italic text-slate-500">...and {previewData.summary.warnings.length - 3} more adjustments</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Sticky Bottom Actions Bar */}
          <footer className="h-14 bg-white border-t border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              {selectedFile && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-semibold">{selectedFile.name}</span>
                </div>
              )}
              <span className="text-xs text-slate-500 hidden sm:inline">
                <span className="font-bold text-slate-800">
                  {previewData.summary?.validTasksCount ?? ((previewData.summary?.totalTasks || 0) + (previewData.summary?.totalSubtasks || 0))} valid tasks
                </span> ready to synchronize
                {previewData.summary?.invalidTasksCount > 0 && (
                  <span className="text-rose-600 font-semibold ml-1.5">
                    ({previewData.summary.invalidTasksCount} skipped due to invalid team)
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Choose Different File</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={executeMutation.isPending || (previewData.summary?.validTasksCount === 0 && (previewData.summary?.totalTasks || 0) > 0)}
                onClick={() => executeMutation.mutate()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              >
                {executeMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing to Database...</span>
                  </>
                ) : (previewData.summary?.validTasksCount === 0 && (previewData.summary?.totalTasks || 0) > 0) ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-200" />
                    <span>No Valid Tasks (Configure Teams to Import)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Confirm & Execute Import ({previewData.summary?.validTasksCount ?? (previewData.summary?.totalTasks || 0)} Valid Tasks)
                    </span>
                  </>
                )}
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* ================= STEP 3: CONFIRMATION & SUCCESS ================= */}
      {step === 'success' && (
        <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col items-center justify-center">
          <div className="max-w-xl w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 shadow-xs">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Project Plan & Timeline Synchronized Successfully!
            </h2>
            <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
              All timeline phases, upper main task hierarchies, subtask attachments, assignees, and dependencies have been imported and synchronized with your project backlog, board, and DAG graph.
            </p>

            {/* Stats badges */}
            <div className="flex items-center flex-wrap justify-center gap-2 mb-8">
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                +{importResult?.createdCount ?? 0} Newly Created
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
                ↺ {importResult?.updatedCount ?? 0} Updated (Re-import)
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                ↳ {importResult?.subtasksCount ?? 0} Subtasks
              </span>
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                📅 {importResult?.sprintsCount ?? 0} Phases / Sprints
              </span>
              {importResult?.dependenciesCount > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  🔗 {importResult.dependenciesCount} Dependencies Linked
                </span>
              )}
              {importResult?.skippedInvalidCount > 0 && (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200" title="Tasks with unconfigured teams skipped. You can add those teams and import them later.">
                  ⛔ {importResult.skippedInvalidCount} Skipped (Invalid Teams — Add Later)
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
              >
                Import Another File
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  handleReset();
                }}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
              >
                View on Board & Timeline
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
