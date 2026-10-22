'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  FileText,
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Eye,
  Send,
  Bug,
  HelpCircle,
  Briefcase,
  Inbox,
  ChevronDown,
  Loader2,
  Layers,
  ArrowRight,
  Users,
  ShieldCheck,
  Check
} from 'lucide-react';
import { RequestsView } from './RequestsView';

interface FormsViewProps {
  projectId: string;
}

interface FormField {
  id: string;
  name: string;
  type: string;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

interface FormTemplate {
  _id?: string;
  id?: string;
  title: string;
  issueType: string;
  description: string;
  color: string;
  status?: string;
  fields: FormField[];
}

export const FormsView: React.FC<FormsViewProps> = ({ projectId }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Navigation mode: 'portal' (Browse 3 Predefined Forms) | 'fill' (Submit Active Form) | 'requests' (Incoming Inbox)
  const [currentView, setCurrentView] = useState<'portal' | 'fill' | 'requests'>('portal');
  const [activeFormId, setActiveFormId] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submittedTicketKey, setSubmittedTicketKey] = useState<string>('');
  const [submissionValues, setSubmissionValues] = useState<Record<string, any>>({});
  const [selectedRelatedTaskId, setSelectedRelatedTaskId] = useState<string>('');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedTeamLeadId, setSelectedTeamLeadId] = useState<string>('');

  // 1. Fetch Predefined Forms from Backend
  const { data: formsData = [], isLoading: isLoadingForms } = useQuery({
    queryKey: ['project-forms', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/forms`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // 1.1 Fetch Teams & Leads
  const { data: teamsData = [] } = useQuery({
    queryKey: ['project-teams-all', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      try {
        const res = await api.get(`/projects/${projectId}/teams`);
        if (Array.isArray(res.data.data) && res.data.data.length > 0) return res.data.data;
      } catch (_) {}
      try {
        const wRes = await api.get(`/teams?projectId=${projectId}`);
        if (Array.isArray(wRes.data.data) && wRes.data.data.length > 0) return wRes.data.data;
      } catch (_) {}
      return [];
    },
    enabled: !!projectId
  });

  const forms: FormTemplate[] = formsData;
  const activeForm = forms.find((f) => f._id === activeFormId || f.id === activeFormId) || forms[0];

  useEffect(() => {
    if (forms.length > 0 && !activeFormId) {
      setActiveFormId(forms[0]._id || forms[0].id || '');
    }
  }, [forms, activeFormId]);

  // 2. Fetch Project Tasks to populate "Select Task" dropdowns
  const { data: tasksData = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/tasks?projectId=${projectId}&limit=100`);
      return res.data.data?.tasks || res.data.data || [];
    },
    enabled: !!projectId
  });

  const allTasks: any[] = Array.isArray(tasksData) ? tasksData : [];

  // Filter tasks depending on active form context & team selection
  const currentUserId = user?._id || user?.id;
  const isBugForm = (activeForm?.title || '').toLowerCase().includes('bug');
  const isHelpForm =
    (activeForm?.title || '').toLowerCase().includes('help') ||
    (activeForm?.title || '').toLowerCase().includes('assistance');
  const isWorkForm =
    (activeForm?.title || '').toLowerCase().includes('work') ||
    (activeForm?.title || '').toLowerCase().includes('dependency');

  let baseTasks = allTasks.filter((t: any) => t.status !== 'DONE' && t.status !== 'COMPLETED');
  if (isHelpForm) {
    // Only tasks allotted / assigned to the logged-in user!
    baseTasks = allTasks.filter(
      (t: any) =>
        (t.assigneeId?._id === currentUserId || t.assigneeId === currentUserId) &&
        t.status !== 'DONE' &&
        t.status !== 'COMPLETED'
    );
  }

  // If a team is selected, filter tasks specifically to that team / team lead
  let relevantTasks = baseTasks;
  if (selectedTeamId) {
    const chosenTeam = teamsData.find((tm: any) => tm._id === selectedTeamId);
    relevantTasks = baseTasks.filter((t: any) => {
      const matchTeamId = t.teamId?._id === selectedTeamId || t.teamId === selectedTeamId;
      const matchTeamName = chosenTeam?.name && t.team && t.team.toLowerCase() === chosenTeam.name.toLowerCase();
      const matchTeamKey = chosenTeam?.key && t.team && t.team.toLowerCase() === chosenTeam.key.toLowerCase();
      const matchLead = chosenTeam?.leadId && (
        t.teamLeadId === (chosenTeam.leadId._id || chosenTeam.leadId) ||
        t.teamLeadId?._id === (chosenTeam.leadId._id || chosenTeam.leadId)
      );
      return matchTeamId || matchTeamName || matchTeamKey || matchLead;
    });
  }

  // Handlers for selection
  const handleSelectTeam = (teamId: string) => {
    setSelectedTeamId(teamId);
    setSelectedRelatedTaskId('');
    const chosen = teamsData.find((tm: any) => tm._id === teamId);
    if (chosen?.leadId) {
      setSelectedTeamLeadId(chosen.leadId._id || chosen.leadId);
    } else {
      setSelectedTeamLeadId('');
    }
  };

  const handleSelectRelatedTask = (taskId: string) => {
    setSelectedRelatedTaskId(taskId);
    if (!taskId) return;
    const taskObj = allTasks.find((t: any) => t._id === taskId);
    if (taskObj) {
      const matched = teamsData.find((tm: any) =>
        tm._id === taskObj.teamId?._id ||
        tm._id === taskObj.teamId ||
        (taskObj.team && tm.name?.toLowerCase() === taskObj.team.toLowerCase()) ||
        (taskObj.team && tm.key?.toLowerCase() === taskObj.team.toLowerCase())
      );
      if (matched) {
        setSelectedTeamId(matched._id);
        const leadId = matched.leadId?._id || matched.leadId;
        if (leadId) setSelectedTeamLeadId(leadId);
      } else if (taskObj.teamLeadId) {
        setSelectedTeamLeadId(taskObj.teamLeadId?._id || taskObj.teamLeadId);
      }

      // Pre-fill target date if available and not yet set
      if (isHelpForm && taskObj.dueDate) {
        const dStr = new Date(taskObj.dueDate).toISOString().split('T')[0];
        setSubmissionValues((prev) => ({ ...prev, 'Target Date': dStr }));
      }
    }
  };

  // 3. Submit Form Mutation
  const submitFormMutation = useMutation({
    mutationFn: async ({ formId, submissionData }: { formId: string; submissionData: any }) => {
      const res = await api.post(`/projects/${projectId}/forms/${formId}/submit`, submissionData);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project-requests', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-summary'] });
      setSubmissionSuccess(true);
      if (data?.data?.key) {
        setSubmittedTicketKey(data.data.key);
      }
    }
  });

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeForm) return;

    setIsSubmitting(true);
    try {
      const formTargetId = activeForm._id || activeForm.id;
      if (!formTargetId) return;

      const summaryField = activeForm.fields.find((f) => f.type === 'Summary');
      const descField = activeForm.fields.find((f) => f.type === 'Description');
      const priorityField = activeForm.fields.find((f) => f.type === 'Priority');
      const dateField = activeForm.fields.find((f) => f.type === 'Date');

      const selectedTaskObj = allTasks.find((t) => t._id === selectedRelatedTaskId);
      const titleVal = summaryField
        ? submissionValues[summaryField.name]
        : selectedTaskObj
        ? `Assistance on [${selectedTaskObj.key}] ${selectedTaskObj.title}`
        : 'Task Assistance';
      const descVal = descField ? submissionValues[descField.name] : '';
      const priorityVal = priorityField ? submissionValues[priorityField.name] : (selectedTaskObj?.priority || 'MEDIUM');
      const dueDateVal = dateField ? submissionValues[dateField.name] : undefined;

      await submitFormMutation.mutateAsync({
        formId: formTargetId,
        submissionData: {
          title: titleVal,
          description: descVal,
          priority: priorityVal,
          dueDate: dueDateVal,
          relatedTaskId: selectedRelatedTaskId || undefined,
          teamId: selectedTeamId || undefined,
          teamLeadId: selectedTeamLeadId || undefined,
          formValues: {
            ...submissionValues,
            ...(selectedRelatedTaskId ? { 'Select Task': selectedRelatedTaskId } : {}),
            ...(selectedTeamId ? { 'Selected Team': selectedTeamId } : {})
          }
        }
      });
    } catch (err) {
      console.error('Failed to submit form:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getFormIcon = (title: string, color: string) => {
    const lower = title.toLowerCase();
    if (lower.includes('bug')) {
      return <Bug className="w-5 h-5 text-rose-600" />;
    } else if (lower.includes('work') || lower.includes('dependency')) {
      return <Briefcase className="w-5 h-5 text-blue-600" />;
    } else if (lower.includes('help') || lower.includes('assistance')) {
      return <HelpCircle className="w-5 h-5 text-amber-600" />;
    }
    return <FileText className="w-5 h-5 text-indigo-600" />;
  };

  // -------------------------------------------------------------
  // MODE 1: REQUESTS INBOX SUBVIEW
  // -------------------------------------------------------------
  if (currentView === 'requests') {
    return (
      <div className="flex flex-col gap-5 text-[#111827] max-w-7xl mx-auto pb-10 animate-fade-in">
        <RequestsView projectId={projectId} />
      </div>
    );
  }

  // -------------------------------------------------------------
  // MODE 2: ACTIVE FORM SUBMISSION VIEW
  // -------------------------------------------------------------
  if (currentView === 'fill' && activeForm) {
    return (
      <div className="flex flex-col gap-6 text-[#111827] max-w-3xl mx-auto pb-14 animate-fade-in">
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setSubmissionSuccess(false);
              setCurrentView('portal');
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Predefined Forms</span>
          </button>

          <button
            onClick={() => setCurrentView('requests')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            <Inbox className="w-3.5 h-3.5 text-slate-600" />
            <span>View Requests Inbox</span>
          </button>
        </div>

        {/* Form Submission Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-md overflow-hidden">
          {/* Top colored band */}
          <div className="h-3 w-full" style={{ backgroundColor: activeForm.color || '#3B82F6' }} />

          <div className="p-6 sm:p-10 flex flex-col gap-6">
            {/* Header */}
            <div className="border-b border-slate-100 pb-5 flex flex-col gap-2">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                  {activeForm.issueType}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {activeForm.fields?.length || 0} fields
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {activeForm.title}
              </h1>
              {activeForm.description && (
                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                  {activeForm.description}
                </p>
              )}
            </div>

            {/* Success State */}
            {submissionSuccess ? (
              <div className="py-10 flex flex-col items-center justify-center text-center gap-4 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Request Submitted Successfully!</h3>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-md">
                    Your request has been routed to your Team Lead
                    {submittedTicketKey && (
                      <strong className="text-slate-800 font-bold font-mono"> [{submittedTicketKey}]</strong>
                    )}
                    . The Team Lead will review and take action.
                  </p>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={() => {
                      setSubmissionSuccess(false);
                      setSubmissionValues({});
                      setSelectedRelatedTaskId('');
                    }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Submit Another Request
                  </button>
                  <button
                    onClick={() => setCurrentView('requests')}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <Inbox className="w-4 h-4" />
                    <span>View in Requests Inbox</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Live Input Form */
              <form onSubmit={handleFormSubmit} className="flex flex-col gap-6">
                {/* 1. TEAM / TEAM LEAD SELECTOR (For Bug Report & Dependency Request) */}
                {(isWorkForm || isBugForm) && (
                  <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs sm:text-sm font-extrabold text-blue-900 flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span>Select Team / Team Lead</span>
                        <span className="text-rose-500 font-black">*</span>
                      </label>
                      {selectedTeamId && (
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Check className="w-3 h-3 text-blue-600" />
                          Team Lead Bound
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-blue-800/80 font-medium">
                      {isBugForm
                        ? 'Select the engineering team responsible for this bug (or choose a task below to auto-bind).'
                        : 'Select the team and lead responsible for resolving this dependency.'}
                    </p>
                    <div className="relative mt-1">
                      <select
                        required={isWorkForm}
                        value={selectedTeamId}
                        onChange={(e) => handleSelectTeam(e.target.value)}
                        className="w-full text-xs sm:text-sm p-3 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 transition-all font-semibold appearance-none cursor-pointer text-slate-800"
                      >
                        <option value="">-- Choose Team / Team Lead --</option>
                        {teamsData.map((tm: any) => {
                          const leadName = tm.leadId?.name || (typeof tm.leadId === 'object' && tm.leadId?.name) || 'Assigned Lead';
                          return (
                            <option key={tm._id} value={tm._id}>
                              {tm.name} ({tm.key || 'TEAM'}) • Lead: {leadName}
                            </option>
                          );
                        })}
                      </select>
                      <ChevronDown className="w-4 h-4 text-blue-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {(activeForm.fields || []).map((f) => (
                  <div key={f.id} className="flex flex-col gap-1.5">
                    <label className="text-xs sm:text-sm font-extrabold text-slate-800 flex items-center gap-1">
                      <span>{f.label || f.name}</span>
                      {f.required && <span className="text-rose-500 font-black">*</span>}
                    </label>
                    {f.description && (
                      <p className="text-xs text-slate-500 font-medium">{f.description}</p>
                    )}

                    {/* SELECT TASK DROPDOWN */}
                    {f.type === 'Select Task' ? (
                      <div className="flex flex-col gap-2.5">
                        <div className="relative">
                          <select
                            required={f.required}
                            value={selectedRelatedTaskId || submissionValues[f.name] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleSelectRelatedTask(val);
                              setSubmissionValues({ ...submissionValues, [f.name]: val });
                            }}
                            className="w-full text-xs sm:text-sm p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium appearance-none cursor-pointer"
                          >
                            {isWorkForm && !selectedTeamId ? (
                              <option value="">-- Please select Team / Team Lead above first --</option>
                            ) : (
                              <option value="">
                                {isBugForm
                                  ? '-- Choose task with bug (or leave empty for general bug) --'
                                  : isHelpForm
                                  ? relevantTasks.length === 0
                                    ? '-- No tasks currently allotted to you --'
                                    : '-- Choose task allotted to you --'
                                  : relevantTasks.length === 0
                                  ? '-- No open tasks available for this team --'
                                  : '-- Choose a task from project --'}
                              </option>
                            )}
                            {(isBugForm && !selectedTeamId ? allTasks.filter((t) => t.status !== 'DONE') : relevantTasks).map((t: any) => {
                              const subCount = t.subtasks?.length || 0;
                              const dueText = t.dueDate ? `Due: ${new Date(t.dueDate).toLocaleDateString()}` : 'No due date';
                              return (
                                <option key={t._id} value={t._id}>
                                  [{t.key}] {t.title} ({t.status} • {dueText}{subCount > 0 ? ` • ${subCount} subtask(s)` : ''})
                                </option>
                              );
                            })}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        {/* SELECTED TASK DETAILS & SUBTASKS (FOR BUG REPORT & TASK ASSISTANCE) */}
                        {selectedRelatedTaskId && (() => {
                          const selTask = allTasks.find((t: any) => t._id === selectedRelatedTaskId);
                          if (!selTask) return null;

                          const hasSubtasks = selTask.subtasks && selTask.subtasks.length > 0;

                          return (
                            <div className="flex flex-col gap-2.5 mt-0.5 animate-fade-in">
                              {/* Task Details Banner */}
                              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                                    {selTask.key}
                                  </span>
                                  <span className="font-bold text-slate-800">{selTask.title}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-600 font-semibold">
                                  <span>Status: <strong className="text-slate-800">{selTask.status}</strong></span>
                                  <span>•</span>
                                  <span>
                                    Due Date:{' '}
                                    {selTask.dueDate ? (
                                      <strong className="text-slate-800">{new Date(selTask.dueDate).toLocaleDateString()}</strong>
                                    ) : (
                                      <strong className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">No due date set</strong>
                                    )}
                                  </span>
                                </div>
                              </div>

                              {/* BUG REPORT: Auto-detected Team & Lead Banner */}
                              {isBugForm && (
                                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span>
                                    Bound to Task's Team ({selTask.team || 'Engineering'}) & routed to Team Lead for review.
                                  </span>
                                </div>
                              )}

                              {/* IF TASK HAS SUBTASKS: SHOW THEM! */}
                              {hasSubtasks && (
                                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex flex-col gap-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                      <span>Subtasks in this Task ({selTask.subtasks.length})</span>
                                    </span>
                                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded">
                                      {isBugForm ? 'Show subtasks' : 'Task Breakdown'}
                                    </span>
                                  </div>
                                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                                    {selTask.subtasks.map((st: any, idx: number) => (
                                      <div
                                        key={st._id || idx}
                                        className="flex items-center justify-between p-2 bg-white border border-indigo-100 rounded-lg text-xs shadow-2xs"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                                            {st.key || `#${idx + 1}`}
                                          </span>
                                          <span className="text-slate-800 font-medium truncate">{st.title}</span>
                                        </div>
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                                          st.isCompleted || st.status === 'DONE'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {st.status || (st.isCompleted ? 'DONE' : 'TODO')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : f.type === 'Description' || f.type === 'Paragraph' ? (
                      <textarea
                        rows={4}
                        required={f.required}
                        value={submissionValues[f.name] || ''}
                        onChange={(e) => setSubmissionValues({ ...submissionValues, [f.name]: e.target.value })}
                        placeholder={f.placeholder || 'Type your details here...'}
                        className="w-full text-xs sm:text-sm p-3.5 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium resize-y leading-relaxed"
                      />
                    ) : f.type === 'Priority' || f.type === 'Dropdown' || (f.options && f.options.length > 0) ? (
                      <div className="relative">
                        <select
                          required={f.required}
                          value={submissionValues[f.name] || ''}
                          onChange={(e) => setSubmissionValues({ ...submissionValues, [f.name]: e.target.value })}
                          className="w-full text-xs sm:text-sm p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium appearance-none cursor-pointer"
                        >
                          <option value="">Select an option...</option>
                          {(f.options && f.options.length > 0
                            ? f.options
                            : ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
                          ).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    ) : f.type === 'Date' ? (
                      <div className="relative">
                        <input
                          type="date"
                          required={f.required}
                          value={submissionValues[f.name] || ''}
                          onChange={(e) => setSubmissionValues({ ...submissionValues, [f.name]: e.target.value })}
                          className="w-full text-xs sm:text-sm p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        required={f.required}
                        value={submissionValues[f.name] || ''}
                        onChange={(e) => setSubmissionValues({ ...submissionValues, [f.name]: e.target.value })}
                        placeholder={f.placeholder || 'Type here...'}
                        className="w-full text-xs sm:text-sm p-3 bg-slate-50 hover:bg-white border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                      />
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-2">
                  <button
                    type="button"
                    onClick={() => setCurrentView('portal')}
                    className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit to Team Lead</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MODE 3: PORTAL VIEW (3 Predefined Forms Cards)
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 text-[#111827] max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* 3 Predefined Forms Gallery Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span>Predefined Forms ({forms.length})</span>
          </h3>
          <span className="text-xs text-slate-500 font-semibold">
            Choose a form to fill and submit
          </span>
        </div>

        {isLoadingForms ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <p className="text-xs font-semibold">Loading predefined forms...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {forms.map((f) => (
              <div
                key={f._id || f.id}
                className="group bg-white border border-slate-200/90 hover:border-blue-400 rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Color Accent */}
                  <div
                    className="h-24 flex items-center justify-between px-6 relative overflow-hidden"
                    style={{ backgroundColor: f.color || '#3B82F6' }}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white/95 text-slate-800 flex items-center justify-center font-black shadow-md">
                      {getFormIcon(f.title, f.color)}
                    </div>

                    <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-white/90 text-slate-800 shadow-xs">
                      {f.issueType}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-6 flex flex-col gap-2.5">
                    <h4 className="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors">
                      {f.title}
                    </h4>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed min-h-[40px]">
                      {f.description}
                    </p>
                    <div className="text-[11px] text-slate-400 font-bold mt-2 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>{f.fields?.length || 0} Standard Fields</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action Button */}
                <div className="p-5 pt-3 border-t border-slate-100 bg-slate-50/60">
                  <button
                    onClick={() => {
                      setActiveFormId(f._id || f.id || '');
                      setSubmissionSuccess(false);
                      setSubmissionValues({});
                      setSelectedRelatedTaskId('');
                      setCurrentView('fill');
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                    <span>Fill & Submit</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
