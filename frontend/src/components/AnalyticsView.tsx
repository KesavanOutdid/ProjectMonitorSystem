'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  TrendingUp,
  Flame,
  Zap,
  BarChart2,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Sparkles,
  Info,
  Users,
  Layers,
  Shield,
  UserCheck,
  Cpu,
  CircuitBoard,
  Terminal,
  Globe,
  Activity,
  Filter,
  Check
} from 'lucide-react';

interface AnalyticsViewProps {
  projectId: string;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ projectId }) => {
  const { user, projects, currentProject } = useAuthStore();

  // Role resolution
  const userRole = user?.role || 'MEMBER';
  const isOrgAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ORG_ADMIN';
  const isProjectManager = userRole === 'PROJECT_MANAGER' || userRole === 'SUPER_ADMIN' || userRole === 'ORG_ADMIN';
  const isTeamLead = userRole === 'TEAM_LEAD' || userRole === 'LEAD';

  // Filters
  const [scopeMode, setScopeMode] = useState<'all' | 'team' | 'personal'>(
    isOrgAdmin || isProjectManager ? 'all' : isTeamLead ? 'team' : 'personal'
  );
  const [selectedTeam, setSelectedTeam] = useState<string>('ALL');
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');

  // 1. Fetch Project Details (including teams & members)
  const { data: projectData } = useQuery({
    queryKey: ['project-detail', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // 2. Fetch Project Summary & Tasks Breakdown
  const { data: projectSummary } = useQuery({
    queryKey: ['project-summary', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const res = await api.get(`/projects/${projectId}/summary`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // 3. Fetch Sprints
  const { data: sprints = [] } = useQuery({
    queryKey: ['project-sprints', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/projects/${projectId}/sprints`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  const activeSprint = sprints.find((s: any) => s.status === 'ACTIVE') || sprints[0];
  const currentSprintId = selectedSprintId || activeSprint?._id;

  // Active query parameters based on scope
  const activeTeamQuery = scopeMode === 'team' && selectedTeam !== 'ALL' ? selectedTeam : undefined;
  const activeAssigneeQuery = scopeMode === 'personal' && user?._id ? user._id : undefined;

  // 4. Fetch Burndown for selected sprint (supports team/personal filtering)
  const { data: burndownData, isLoading: isLoadingBurndown } = useQuery({
    queryKey: ['sprint-burndown', projectId, currentSprintId, scopeMode, selectedTeam, activeAssigneeQuery],
    queryFn: async () => {
      if (!projectId || !currentSprintId) return null;
      const params = new URLSearchParams();
      if (activeTeamQuery) params.append('team', activeTeamQuery);
      if (activeAssigneeQuery) params.append('assigneeId', activeAssigneeQuery);

      const res = await api.get(`/projects/${projectId}/sprints/${currentSprintId}/burndown?${params.toString()}`);
      return res.data.data;
    },
    enabled: !!projectId && !!currentSprintId
  });

  // 5. Fetch Velocity metrics (supports team/personal filtering)
  const { data: velocityData, isLoading: isLoadingVelocity } = useQuery({
    queryKey: ['project-velocity', projectId, scopeMode, selectedTeam, activeAssigneeQuery],
    queryFn: async () => {
      if (!projectId) return null;
      const params = new URLSearchParams();
      if (activeTeamQuery) params.append('team', activeTeamQuery);
      if (activeAssigneeQuery) params.append('assigneeId', activeAssigneeQuery);

      const res = await api.get(`/projects/${projectId}/velocity?${params.toString()}`);
      return res.data.data;
    },
    enabled: !!projectId
  });

  // 6. Fetch Project Tasks to build live team & member capacity metrics
  const { data: projectTasks = [] } = useQuery({
    queryKey: ['project-tasks-analytics', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await api.get(`/tasks?projectId=${projectId}`);
      return res.data.data || [];
    },
    enabled: !!projectId
  });

  // Dynamic Team & Workgroup Distribution inside this project
  const disciplineStats = useMemo(() => {
    const teamMap = new Map<string, { key: string; name: string; tag: string; icon: any; color: string; total: number; done: number; inProg: number }>();
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#6366F1'];

    // Initialize with project defined teams if any
    (projectData?.teams || []).forEach((tm: any, idx: number) => {
      const key = (tm.name || '').toLowerCase();
      teamMap.set(key, {
        key,
        name: tm.name,
        tag: tm.key || tm.name.slice(0, 3).toUpperCase(),
        icon: Layers,
        color: tm.color || colors[idx % colors.length],
        total: 0,
        done: 0,
        inProg: 0
      });
    });

    projectTasks.forEach((t: any) => {
      const teamName = (t.team && t.team.trim()) ? t.team.trim() : 'General Tasks';
      const key = teamName.toLowerCase();
      if (!teamMap.has(key)) {
        const color = colors[teamMap.size % colors.length];
        const tag = teamName.slice(0, 3).toUpperCase();
        teamMap.set(key, {
          key,
          name: teamName,
          tag,
          icon: Layers,
          color,
          total: 0,
          done: 0,
          inProg: 0
        });
      }
      const target = teamMap.get(key)!;
      target.total++;
      if (t.status === 'DONE') target.done++;
      else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') target.inProg++;
    });

    return Array.from(teamMap.values()).map(item => ({
      ...item,
      completionRate: item.total > 0 ? Math.round((item.done / item.total) * 100) : 0
    }));
  }, [projectTasks, projectData?.teams]);

  // Compute Project Member Workload / Capacity
  const memberWorkloads = useMemo(() => {
    const map = new Map<string, { user: any; total: number; done: number; inProgress: number }>();

    projectTasks.forEach((t: any) => {
      if (!t.assigneeId) return;
      const uid = t.assigneeId._id || t.assigneeId;
      if (!uid) return;

      if (!map.has(uid)) {
        map.set(uid, {
          user: typeof t.assigneeId === 'object' ? t.assigneeId : { _id: uid, name: 'Member' },
          total: 0,
          done: 0,
          inProgress: 0
        });
      }
      const entry = map.get(uid)!;
      entry.total++;
      if (t.status === 'DONE') entry.done++;
      else if (t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW') entry.inProgress++;
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [projectTasks]);

  const timeline = burndownData?.timeline || [];
  const maxTasks = Math.max(1, burndownData?.totalTasks || 10);

  // SVG Chart Dimensions for Burndown
  const chartWidth = 650;
  const chartHeight = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Calculate points for SVG Polyline
  const getX = (index: number) => {
    if (timeline.length <= 1) return padding.left;
    return padding.left + (index / (timeline.length - 1)) * graphWidth;
  };

  const getY = (val: number) => {
    return padding.top + graphHeight - (val / maxTasks) * graphHeight;
  };

  // Ideal Line points
  const idealPoints = timeline
    .map((d: any, i: number) => `${getX(i)},${getY(d.ideal)}`)
    .join(' ');

  // Actual Line points
  const actualItems = timeline.filter((d: any) => d.actual !== null);
  const actualPoints = actualItems
    .map((d: any, i: number) => `${getX(i)},${getY(d.actual)}`)
    .join(' ');

  return (
    <div className="flex flex-col gap-6 text-[#111827] max-w-7xl mx-auto select-none">
      {/* ========================================================================= */}
      {/* 🧭 SCOPE & ROLE-BASED FILTER BANNER                                       */}
      {/* ========================================================================= */}
      <div className="bg-white/95 backdrop-blur-md p-5 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="p-2 rounded-xl bg-[#0F172A] text-white shadow-xs">
              <BarChart2 className="w-4 h-4 text-[#22C55E]" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[#111827]">
                  {projectData?.name || currentProject?.name || 'Project'} Analytics
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Role: {userRole.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                {scopeMode === 'all'
                  ? 'Showing all teams, disciplines & sprints across the project.'
                  : scopeMode === 'team'
                  ? `Filtered specifically for team: ${selectedTeam === 'ALL' ? 'All Disciplines' : selectedTeam}`
                  : 'Personal mode: Showing your assigned sprint deliverables & velocity.'}
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Scope Filter, Team Selector, Sprint Selector */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Scope Mode Selector Tabs */}
          <div className="flex items-center p-1 bg-gray-100 rounded-xl border border-gray-200">
            {(isOrgAdmin || isProjectManager) && (
              <button
                type="button"
                onClick={() => setScopeMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  scopeMode === 'all'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                🏢 All Teams
              </button>
            )}

            <button
              type="button"
              onClick={() => setScopeMode('team')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                scopeMode === 'team'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              ⚙️ By Team / Discipline
            </button>

            <button
              type="button"
              onClick={() => setScopeMode('personal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                scopeMode === 'personal'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              👤 My Scope
            </button>
          </div>

          {/* Discipline / Team Selector (if in team mode or all mode) */}
          {scopeMode === 'team' && (
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-[#111827] outline-none focus:border-[#0F172A] cursor-pointer shadow-2xs"
            >
              <option value="ALL">All Disciplines</option>
              <option value="Hardware Engineering">Hardware & Electronics</option>
              <option value="PCB Engineering">PCB Layout & Fabrication</option>
              <option value="Embedded Systems">Embedded & Firmware</option>
              <option value="Software Engineering">Cloud & Software</option>
              <option value="QA & Validation">QA & Reliability</option>
            </select>
          )}

          {/* Sprint Selector */}
          <div className="flex items-center gap-1.5">
            <select
              value={currentSprintId || ''}
              onChange={(e) => setSelectedSprintId(e.target.value)}
              className="text-xs bg-white border border-gray-200 rounded-xl px-3 py-2 font-bold text-[#111827] outline-none focus:border-[#0F172A] cursor-pointer shadow-2xs"
            >
              {sprints.map((s: any) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 KPI CARDS ROW                                                          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">
              {scopeMode === 'personal' ? 'My Sprint Tasks' : 'Sprint Tasks'}
            </span>
            <h3 className="text-2xl font-black text-[#0F172A] mt-1">
              {burndownData?.totalTasks || 0}{' '}
              <span className="text-xs text-gray-400 font-medium">tasks</span>
            </h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Flame className="w-5 h-5 text-amber-500" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">
              {scopeMode === 'personal' ? 'My Average Velocity' : 'Average Velocity'}
            </span>
            <h3 className="text-2xl font-black text-[#22C55E] mt-1">
              {velocityData?.averageVelocity || 0}{' '}
              <span className="text-xs text-gray-400 font-medium">tasks/sprint</span>
            </h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#22C55E] flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Tasks Completed</span>
            <h3 className="text-2xl font-black text-[#0F172A] mt-1">
              {burndownData?.completedTasks || 0}
            </h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Sprint Cadence</span>
            <h3 className="text-base font-black text-[#0F172A] mt-1">
              {timeline.length} Days
            </h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-700 flex items-center justify-center font-bold">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 DYNAMIC TEAM & WORKGROUP CAPACITY MATRIX IN THIS PROJECT               */}
      {/* ========================================================================= */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#0F172A]">
                Team & Workgroup Capacity
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Real-time task completion and in-progress workload across project teams.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:inline">
            Project Scope
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {disciplineStats.map((item) => {
            const Icon = item.icon || Layers;
            return (
              <div
                key={item.key}
                onClick={() => {
                  setScopeMode('team');
                  setSelectedTeam(item.name);
                }}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  selectedTeam.toLowerCase().includes(item.key) && scopeMode === 'team'
                    ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-2 ring-blue-500/20'
                    : 'border-gray-200/90 bg-gray-50/40 hover:bg-gray-100/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="p-1.5 rounded-lg text-white font-black text-xs flex items-center gap-1 shadow-2xs"
                      style={{ backgroundColor: item.color }}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.tag}</span>
                    </span>
                    <span className="text-xs font-black text-gray-700">
                      {item.completionRate}%
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-gray-900 leading-snug line-clamp-1">
                    {item.name}
                  </h4>
                  <p className="text-[11px] text-gray-500 font-semibold mt-1">
                    {item.done} / {item.total} Done · {item.inProg} Active
                  </p>
                </div>

                <div className="mt-3">
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.completionRate}%`,
                        backgroundColor: item.color
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📈 SPRINT BURNDOWN & VELOCITY CHARTS                                      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sprint Burndown SVG Chart */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#111827] flex items-center gap-1.5">
                  <span>Sprint Burndown</span>
                  <span className="text-xs text-gray-400 font-normal">
                    ({burndownData?.sprintName || 'Active Sprint'})
                  </span>
                </h3>
                <p className="text-[11px] text-gray-500">
                  Ideal guideline vs. actual tasks remaining
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-gray-400 border-b border-dashed" />
                  <span className="text-gray-500 text-[11px] font-medium">Ideal Burn</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-[#22C55E] rounded-full" />
                  <span className="text-[#0F172A] text-[11px] font-bold">Actual Burn</span>
                </div>
              </div>
            </div>

            {/* SVG Visualizer */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="w-full h-auto min-w-[500px]"
              >
                {/* Horizontal Grid Lines & Y-Axis Labels */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = padding.top + graphHeight * (1 - ratio);
                  const tasksVal = Math.round(maxTasks * ratio);
                  return (
                    <g key={idx}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={chartWidth - padding.right}
                        y2={y}
                        stroke="#E5E7EB"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#9CA3AF"
                        fontWeight="600"
                      >
                        {tasksVal}
                      </text>
                    </g>
                  );
                })}

                {/* X-Axis Labels */}
                {timeline.map((d: any, idx: number) => {
                  if (idx % Math.ceil(timeline.length / 7) === 0 || idx === timeline.length - 1) {
                    const x = getX(idx);
                    return (
                      <text
                        key={idx}
                        x={x}
                        y={chartHeight - 12}
                        textAnchor="middle"
                        fontSize="10"
                        fill="#6B7280"
                        fontWeight="600"
                      >
                        {d.day}
                      </text>
                    );
                  }
                  return null;
                })}

                {/* Ideal Line (Dashed Slate) */}
                {idealPoints && (
                  <polyline
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="2"
                    strokeDasharray="6 6"
                    points={idealPoints}
                  />
                )}

                {/* Actual Line (Solid Emerald) */}
                {actualPoints && (
                  <>
                    <polyline
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={actualPoints}
                    />
                    {actualItems.map((d: any, idx: number) => (
                      <circle
                        key={idx}
                        cx={getX(idx)}
                        cy={getY(d.actual)}
                        r="4.5"
                        fill="#0F172A"
                        stroke="#22C55E"
                        strokeWidth="2.5"
                      />
                    ))}
                  </>
                )}
              </svg>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Tasks remaining: <strong>{actualItems[actualItems.length - 1]?.actual ?? 0} tasks</strong></span>
            <span>Sprint ends: <strong>{new Date(burndownData?.endDate || Date.now()).toLocaleDateString()}</strong></span>
          </div>
        </div>

        {/* Velocity Bar Chart */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#111827]">Sprint Velocity Chart</h3>
                <p className="text-[11px] text-gray-500">
                  Committed vs. Completed tasks across sprint history
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-gray-300 rounded-sm" />
                  <span className="text-gray-500 text-[11px] font-medium">Committed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-[#0F172A] rounded-sm" />
                  <span className="text-[#0F172A] text-[11px] font-bold">Completed</span>
                </div>
              </div>
            </div>

            {/* Bar Visualizer */}
            <div className="flex items-end justify-between gap-4 h-56 pt-6 px-4 border-b border-gray-200 pb-2">
              {(velocityData?.sprints || []).map((sprint: any, idx: number) => {
                const maxVal = Math.max(1, ...velocityData.sprints.map((s: any) => Math.max(s.committed, s.completed)));
                const committedHeight = (sprint.committed / maxVal) * 100;
                const completedHeight = (sprint.completed / maxVal) * 100;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                    <div className="flex items-end gap-1.5 w-full justify-center h-full">
                      {/* Committed Bar */}
                      <div
                        style={{ height: `${Math.max(8, committedHeight)}%` }}
                        className="w-4 sm:w-6 bg-gray-200 hover:bg-gray-300 rounded-t-md transition-all relative cursor-pointer"
                        title={`Committed: ${sprint.committed} tasks`}
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-gray-600 bg-white px-1 rounded shadow-xs">
                          {sprint.committed}
                        </span>
                      </div>

                      {/* Completed Bar */}
                      <div
                        style={{ height: `${Math.max(8, completedHeight)}%` }}
                        className="w-4 sm:w-6 bg-[#0F172A] group-hover:bg-[#1E293B] rounded-t-md transition-all relative cursor-pointer"
                        title={`Completed: ${sprint.completed} tasks`}
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#22C55E] bg-white px-1 rounded shadow-xs">
                          {sprint.completed}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold text-gray-500 truncate max-w-[65px] text-center">
                      {sprint.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 flex items-center justify-between text-[11px] text-gray-500">
            <span>Rolling average: <strong className="text-[#22C55E]">{velocityData?.averageVelocity || 0} tasks/sprint</strong></span>
            <span>Status: <strong className="text-[#0F172A]">Healthy Velocity</strong></span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 👥 PROJECT MEMBER WORKLOAD & WORK DISTRIBUTION                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Member Workload Matrix */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Member Workload & Resource Allocation
              </h3>
              <span className="text-xs font-bold text-gray-400 uppercase">Engineers</span>
            </div>

            <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
              {memberWorkloads.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">No assigned members with tasks in this project.</p>
              ) : (
                memberWorkloads.map((m, idx) => {
                  const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                  return (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50/70 border border-gray-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#0F172A] text-white flex items-center justify-center font-bold text-xs uppercase">
                          {m.user.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{m.user.name}</p>
                          <p className="text-[10px] text-gray-400 font-semibold">{m.user.jobTitle || 'Engineer'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right">
                        <div>
                          <span className="text-xs font-black text-gray-800">
                            {m.done} / {m.total}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium ml-1">done</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
            <span>Total Assigned Members: <strong>{memberWorkloads.length}</strong></span>
            <span className="text-emerald-600 font-bold">Active Project Scope</span>
          </div>
        </div>

        {/* Priority & Work Type Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-600" />
                Issue Priority & Type Distribution
              </h3>
              <span className="text-xs font-bold text-gray-400 uppercase">Health</span>
            </div>

            {/* Priority Bars */}
            <div className="flex flex-col gap-2.5 mb-4">
              <span className="text-[11px] font-bold text-gray-500 uppercase">Priority Breakdown</span>
              <div className="grid grid-cols-5 gap-1.5 text-center">
                {Object.entries(projectSummary?.priorityBreakdown || { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0, LOWEST: 0 }).map(([k, v]: [string, any]) => (
                  <div key={k} className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] font-black text-gray-400 uppercase block">{k}</span>
                    <span className="text-sm font-black text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Issue Types */}
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-bold text-gray-500 uppercase">Work Types</span>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                {Object.entries(projectSummary?.typesOfWork || { STORY: 0, TASK: 0, BUG: 0, EPIC: 0 }).map(([k, v]: [string, any]) => (
                  <div key={k} className="p-2 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] font-black text-gray-400 uppercase block">{k}</span>
                    <span className="text-sm font-black text-gray-800">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
            <span>Project Health Indicator</span>
            <span className="text-blue-600 font-bold">Synchronized</span>
          </div>
        </div>
      </div>
    </div>
  );
};
