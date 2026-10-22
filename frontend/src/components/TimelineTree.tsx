'use client';

import React, { useState, useMemo } from 'react';
import {
  FolderKanban,
  User,
  Users,
  Zap,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  CheckCircle2,
  Layers,
  ArrowRight,
  ChevronsUpDown,
  Maximize2,
  Sparkles,
  Flame,
  Check
} from 'lucide-react';

export type TimeframeOption = '24h' | '7d' | '30d' | '1y' | 'ALL';

interface TimelineTreeProps {
  tasks: any[];
  projects?: any[];
  sprints?: any[];
  teams?: any[];
  members?: any[];
  title?: string;
  subtitle?: string;
  selectedProjectId?: string;
  selectedMemberId?: string;
  selectedTimeframe?: TimeframeOption;
  onTimeframeChange?: (tf: TimeframeOption) => void;
  onMemberChange?: (memberId: string) => void;
  onProjectChange?: (projectId: string) => void;
  onSelectTask?: (task: any) => void;
  hideControls?: boolean;
}

export const TimelineTree: React.FC<TimelineTreeProps> = ({
  tasks = [],
  projects = [],
  sprints = [],
  teams = [],
  members = [],
  title = 'Timeline Roadmap & Tree',
  subtitle = 'Hierarchical milestone schedules, sprints, and task execution progress',
  selectedProjectId = 'ALL',
  selectedMemberId = 'ALL',
  selectedTimeframe = '30d',
  onTimeframeChange,
  onMemberChange,
  onProjectChange,
  onSelectTask,
  hideControls = false
}) => {
  const [viewMode, setViewMode] = useState<'project' | 'person'>('project');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(true);

  // Timeframe calculation helper
  const now = useMemo(() => new Date(), []);

  const timeframeBoundary = useMemo(() => {
    if (selectedTimeframe === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '7d') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '30d') return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (selectedTimeframe === '1y') return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return null; // ALL
  }, [selectedTimeframe, now]);

  // 1. Filter Tasks by Timeframe, Member, Project, Search
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Timeframe filter (created, updated, or due within range)
      if (timeframeBoundary) {
        const created = t.createdAt ? new Date(t.createdAt) : null;
        const updated = t.updatedAt ? new Date(t.updatedAt) : null;
        const due = t.dueDate ? new Date(t.dueDate) : null;
        const inRange =
          (created && created >= timeframeBoundary) ||
          (updated && updated >= timeframeBoundary) ||
          (due && due >= timeframeBoundary);
        if (!inRange) return false;
      }

      // Project filter
      if (selectedProjectId && selectedProjectId !== 'ALL') {
        const pId = (t.projectId?._id || t.projectId)?.toString();
        if (pId !== selectedProjectId) return false;
      }

      // Member filter
      if (selectedMemberId && selectedMemberId !== 'ALL') {
        const mId = (t.assigneeId?._id || t.assigneeId)?.toString();
        if (mId !== selectedMemberId) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTitle = t.title?.toLowerCase().includes(term);
        const matchKey = t.key?.toLowerCase().includes(term);
        const matchAssignee = (t.assigneeId?.name || '').toLowerCase().includes(term);
        const matchTeam = (t.team || '').toLowerCase().includes(term);
        if (!matchTitle && !matchKey && !matchAssignee && !matchTeam) return false;
      }

      return true;
    });
  }, [tasks, timeframeBoundary, selectedProjectId, selectedMemberId, searchTerm]);

  // Tree toggle handler
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const isCurrentlyOpen = prev[nodeId] !== undefined ? prev[nodeId] : allExpanded;
      return { ...prev, [nodeId]: !isCurrentlyOpen };
    });
  };

  const isNodeOpen = (nodeId: string) => {
    return expandedNodes[nodeId] !== undefined ? expandedNodes[nodeId] : allExpanded;
  };

  const handleToggleAll = () => {
    const nextState = !allExpanded;
    setAllExpanded(nextState);
    setExpandedNodes({});
  };

  // 2. Metrics summary for the tree
  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const done = filteredTasks.filter((t) => t.status === 'DONE').length;
    const inProgress = filteredTasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const overdue = filteredTasks.filter(
      (t) => t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now
    ).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, overdue, percent };
  }, [filteredTasks, now]);

  // 3. Hierarchy Builder: By Project (Project -> Sprint -> Team -> Tasks)
  const projectTree = useMemo(() => {
    const pMap: Record<string, any> = {};

    filteredTasks.forEach((t) => {
      const pId = (t.projectId?._id || t.projectId)?.toString() || 'unknown_project';
      const pName = t.project?.name || t.projectName || 'Project';
      const pKey = t.project?.key || t.projectKey || 'PROJ';
      const pColor = t.project?.color || '#3B82F6';

      if (!pMap[pId]) {
        pMap[pId] = {
          id: pId,
          name: pName,
          key: pKey,
          color: pColor,
          sprints: {},
          tasksCount: 0,
          doneCount: 0,
          overdueCount: 0
        };
      }
      pMap[pId].tasksCount++;
      if (t.status === 'DONE') pMap[pId].doneCount++;
      if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) {
        pMap[pId].overdueCount++;
      }

      const sprintName = t.sprint || (t.sprintId ? 'Active Sprint' : 'Backlog');
      if (!pMap[pId].sprints[sprintName]) {
        pMap[pId].sprints[sprintName] = {
          name: sprintName,
          teams: {},
          tasksCount: 0,
          doneCount: 0,
          overdueCount: 0
        };
      }
      pMap[pId].sprints[sprintName].tasksCount++;
      if (t.status === 'DONE') pMap[pId].sprints[sprintName].doneCount++;
      if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) {
        pMap[pId].sprints[sprintName].overdueCount++;
      }

      const teamName = t.team || 'General Engineering';
      if (!pMap[pId].sprints[sprintName].teams[teamName]) {
        pMap[pId].sprints[sprintName].teams[teamName] = {
          name: teamName,
          tasks: [],
          doneCount: 0,
          overdueCount: 0
        };
      }
      pMap[pId].sprints[sprintName].teams[teamName].tasks.push(t);
      if (t.status === 'DONE') pMap[pId].sprints[sprintName].teams[teamName].doneCount++;
      if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) {
        pMap[pId].sprints[sprintName].teams[teamName].overdueCount++;
      }
    });

    return Object.values(pMap);
  }, [filteredTasks, now]);

  // 4. Hierarchy Builder: By Person (Member -> Project -> Tasks)
  const personTree = useMemo(() => {
    const memMap: Record<string, any> = {};

    filteredTasks.forEach((t) => {
      const mId = (t.assigneeId?._id || t.assigneeId)?.toString() || 'unassigned';
      const mName = t.assigneeId?.name || (mId === 'unassigned' ? 'Unassigned' : 'Team Member');
      const mEmail = t.assigneeId?.email || '';
      const mAvatar = t.assigneeId?.avatar || '';

      if (!memMap[mId]) {
        memMap[mId] = {
          id: mId,
          name: mName,
          email: mEmail,
          avatar: mAvatar,
          projects: {},
          tasksCount: 0,
          doneCount: 0,
          overdueCount: 0
        };
      }
      memMap[mId].tasksCount++;
      if (t.status === 'DONE') memMap[mId].doneCount++;
      if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) {
        memMap[mId].overdueCount++;
      }

      const pId = (t.projectId?._id || t.projectId)?.toString() || 'unknown';
      const pName = t.project?.name || 'Project';
      const pKey = t.project?.key || 'PROJ';
      const pColor = t.project?.color || '#3B82F6';

      if (!memMap[mId].projects[pId]) {
        memMap[mId].projects[pId] = {
          id: pId,
          name: pName,
          key: pKey,
          color: pColor,
          tasks: [],
          doneCount: 0,
          overdueCount: 0
        };
      }
      memMap[mId].projects[pId].tasks.push(t);
      if (t.status === 'DONE') memMap[mId].projects[pId].doneCount++;
      if (t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now) {
        memMap[mId].projects[pId].overdueCount++;
      }
    });

    return Object.values(memMap).sort((a, b) => b.tasksCount - a.tasksCount);
  }, [filteredTasks, now]);

  // Unique Members & Projects for filter dropdowns
  const availableMembers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    tasks.forEach((t) => {
      if (t.assigneeId && (t.assigneeId._id || t.assigneeId)) {
        const id = (t.assigneeId._id || t.assigneeId).toString();
        const name = t.assigneeId.name || 'Member';
        map.set(id, { id, name });
      }
    });
    return Array.from(map.values());
  }, [tasks]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/90 shadow-xs hover:shadow-md transition-all overflow-hidden">
      {/* Top Header & Interactive Controls Bar */}
      <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50/90 via-white to-slate-50/60 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-xs">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-[#0F172A] tracking-tight flex items-center gap-2">
                  <span>{title}</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {metrics.total} {metrics.total === 1 ? 'task' : 'tasks'}
                  </span>
                </h3>
                <p className="text-xs text-gray-500 font-medium mt-0.5">{subtitle}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats Pill Header */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto text-xs font-bold">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{metrics.done} Done ({metrics.percent}%)</span>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>{metrics.inProgress} In Progress</span>
            </span>
            {metrics.overdue > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>{metrics.overdue} Overdue</span>
              </span>
            )}
            <button
              onClick={handleToggleAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
            </button>
          </div>
        </div>

        {/* Filters & Mode Switch Toolbar */}
        {!hideControls && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-gray-100">
            {/* Left: View Mode Toggle (By Project vs By Person) */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200/80">
                <button
                  onClick={() => setViewMode('project')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'project'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>By Project</span>
                </button>
                <button
                  onClick={() => setViewMode('person')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    viewMode === 'person'
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>By Person</span>
                </button>
              </div>

              {/* Time Window Pills */}
              {onTimeframeChange && (
                <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-gray-200/80">
                  {(
                    [
                      { key: '24h', label: 'Day' },
                      { key: '7d', label: 'Week' },
                      { key: '30d', label: 'Month' },
                      { key: '1y', label: 'Year' },
                      { key: 'ALL', label: 'All' }
                    ] as const
                  ).map((tf) => (
                    <button
                      key={tf.key}
                      onClick={() => onTimeframeChange(tf.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                        selectedTimeframe === tf.key
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/60'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Person Filter Dropdown & Search Bar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Member Filter */}
              {onMemberChange && availableMembers.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedMemberId}
                    onChange={(e) => onMemberChange(e.target.value)}
                    className="text-xs font-semibold bg-gray-50 hover:bg-white border border-gray-200 rounded-xl px-3 py-1.5 outline-none text-[#0F172A] cursor-pointer"
                  >
                    <option value="ALL">All Assignees</option>
                    {availableMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        👤 {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Live Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter tree..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs bg-gray-50 focus:bg-white border border-gray-200 focus:border-blue-500 rounded-xl pl-8 pr-3 py-1.5 outline-none text-[#0F172A] w-36 sm:w-44 transition-all"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hierarchical Tree Body */}
      <div className="p-4 sm:p-6 bg-slate-50/40">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
            <Layers className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-gray-700">No scheduled tasks match this timeline view</h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Try adjusting the Day/Week/Month/Year filter or switching the assignee scope.
            </p>
          </div>
        ) : viewMode === 'project' ? (
          /* ========================================================================= */
          /* 📁 MODE 1: BY PROJECT (Project -> Sprint -> Team -> Tasks)                */
          /* ========================================================================= */
          <div className="flex flex-col gap-4">
            {projectTree.map((p: any) => {
              const pOpen = isNodeOpen(`p-${p.id}`);
              const pPercent = p.tasksCount > 0 ? Math.round((p.doneCount / p.tasksCount) * 100) : 0;

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden"
                >
                  {/* Project Root Node */}
                  <div
                    onClick={() => toggleNode(`p-${p.id}`)}
                    className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-gray-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-gray-400 hover:text-gray-700">
                        {pOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs"
                        style={{ backgroundColor: p.color || '#0F172A' }}
                      >
                        <FolderKanban className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-[#0F172A] truncate">{p.name}</span>
                          <span className="text-xs font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            [{p.key}]
                          </span>
                        </div>
                        <span className="text-xs text-gray-500 font-medium">
                          {p.tasksCount} scheduled items · {p.doneCount} completed
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {p.overdueCount > 0 && (
                        <span className="text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>{p.overdueCount} Overdue</span>
                        </span>
                      )}
                      <div className="flex items-center gap-2 w-28 sm:w-36">
                        <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${pPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-[#0F172A] w-8 text-right">{pPercent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Sprints Children */}
                  {pOpen && (
                    <div className="p-4 bg-slate-50/50 flex flex-col gap-3 pl-6 sm:pl-8 border-l-2 border-blue-500/20 ml-6 my-2">
                      {Object.values(p.sprints).map((sprint: any) => {
                        const sId = `s-${p.id}-${sprint.name}`;
                        const sOpen = isNodeOpen(sId);
                        const sPercent =
                          sprint.tasksCount > 0 ? Math.round((sprint.doneCount / sprint.tasksCount) * 100) : 0;

                        return (
                          <div
                            key={sprint.name}
                            className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden"
                          >
                            {/* Sprint Node */}
                            <div
                              onClick={() => toggleNode(sId)}
                              className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-gray-100/70"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-gray-400">
                                  {sOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs shrink-0">
                                  <Zap className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-extrabold text-xs sm:text-sm text-gray-900 block truncate">
                                    {sprint.name}
                                  </span>
                                  <span className="text-[11px] text-gray-400 font-medium">
                                    {sprint.tasksCount} tasks · {sprint.doneCount} done
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                {sprint.overdueCount > 0 && (
                                  <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                                    {sprint.overdueCount} overdue
                                  </span>
                                )}
                                <span className="text-xs font-black text-gray-700">{sPercent}%</span>
                              </div>
                            </div>

                            {/* Teams Sub-Nodes */}
                            {sOpen && (
                              <div className="p-3 bg-slate-50/70 flex flex-col gap-2 pl-4 sm:pl-6 border-l-2 border-amber-500/20 ml-5 my-1.5">
                                {Object.values(sprint.teams).map((team: any) => {
                                  const tId = `t-${p.id}-${sprint.name}-${team.name}`;
                                  const tOpen = isNodeOpen(tId);

                                  return (
                                    <div
                                      key={team.name}
                                      className="bg-white rounded-lg border border-gray-200/70 overflow-hidden"
                                    >
                                      {/* Team Discipline Node */}
                                      <div
                                        onClick={() => toggleNode(tId)}
                                        className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer transition-colors"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-gray-400">
                                            {tOpen ? (
                                              <ChevronDown className="w-3 h-3" />
                                            ) : (
                                              <ChevronRight className="w-3 h-3" />
                                            )}
                                          </span>
                                          <Users className="w-3.5 h-3.5 text-blue-500" />
                                          <span className="text-xs font-bold text-gray-800 truncate">
                                            {team.name}
                                          </span>
                                          <span className="text-[10px] font-semibold text-gray-400">
                                            ({team.tasks.length})
                                          </span>
                                        </div>

                                        {team.overdueCount > 0 && (
                                          <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                                            ⚠️ {team.overdueCount}
                                          </span>
                                        )}
                                      </div>

                                      {/* Task Leaf Nodes */}
                                      {tOpen && (
                                        <div className="p-2 bg-slate-50/80 divide-y divide-gray-100 border-t border-gray-100">
                                          {team.tasks.map((task: any) => (
                                            <TaskLeafRow
                                              key={task._id || task.key}
                                              task={task}
                                              now={now}
                                              onSelectTask={onSelectTask}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ========================================================================= */
          /* 👤 MODE 2: BY PERSON (Member -> Project -> Tasks)                         */
          /* ========================================================================= */
          <div className="flex flex-col gap-4">
            {personTree.map((mem: any) => {
              const mOpen = isNodeOpen(`m-${mem.id}`);
              const mPercent =
                mem.tasksCount > 0 ? Math.round((mem.doneCount / mem.tasksCount) * 100) : 0;

              return (
                <div
                  key={mem.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden"
                >
                  {/* Person Node */}
                  <div
                    onClick={() => toggleNode(`m-${mem.id}`)}
                    className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-gray-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-gray-400">
                        {mOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </span>
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0F172A] to-[#334155] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                        {mem.name?.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-[#0F172A] truncate">{mem.name}</span>
                          {mem.email && (
                            <span className="text-xs text-gray-400 truncate hidden sm:inline">
                              &lt;{mem.email}&gt;
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 font-medium">
                          {mem.tasksCount} assigned items · {mem.doneCount} completed
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      {mem.overdueCount > 0 && (
                        <span className="text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>{mem.overdueCount} Overdue</span>
                        </span>
                      )}
                      <div className="flex items-center gap-2 w-28 sm:w-36">
                        <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                            style={{ width: `${mPercent}%` }}
                          />
                        </div>
                        <span className="text-xs font-black text-[#0F172A] w-8 text-right">{mPercent}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Member's Project Nodes */}
                  {mOpen && (
                    <div className="p-4 bg-slate-50/50 flex flex-col gap-3 pl-6 sm:pl-8 border-l-2 border-emerald-500/20 ml-6 my-2">
                      {Object.values(mem.projects).map((proj: any) => {
                        const mpId = `mp-${mem.id}-${proj.id}`;
                        const mpOpen = isNodeOpen(mpId);
                        const mpPercent =
                          proj.tasks.length > 0 ? Math.round((proj.doneCount / proj.tasks.length) * 100) : 0;

                        return (
                          <div
                            key={proj.id}
                            className="bg-white rounded-xl border border-gray-200/80 shadow-2xs overflow-hidden"
                          >
                            <div
                              onClick={() => toggleNode(mpId)}
                              className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-gray-100/70"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-gray-400">
                                  {mpOpen ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: proj.color || '#3B82F6' }}
                                />
                                <span className="font-extrabold text-xs text-gray-900 truncate">
                                  {proj.name}
                                </span>
                                <span className="text-xs font-mono font-bold text-gray-400">
                                  [{proj.key}]
                                </span>
                                <span className="text-[11px] text-gray-400 font-medium">
                                  ({proj.tasks.length} tasks)
                                </span>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                {proj.overdueCount > 0 && (
                                  <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                    {proj.overdueCount} overdue
                                  </span>
                                )}
                                <span className="text-xs font-black text-gray-700">{mpPercent}%</span>
                              </div>
                            </div>

                            {/* Task List */}
                            {mpOpen && (
                              <div className="p-2 bg-slate-50/80 divide-y divide-gray-100">
                                {proj.tasks.map((task: any) => (
                                  <TaskLeafRow
                                    key={task._id || task.key}
                                    task={task}
                                    now={now}
                                    onSelectTask={onSelectTask}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Reusable Task Leaf Row Component with Gantt Progress Indicator
const TaskLeafRow: React.FC<{
  task: any;
  now: Date;
  onSelectTask?: (t: any) => void;
}> = ({ task, now, onSelectTask }) => {
  const isDone = task.status === 'DONE';
  const isOverdue = task.dueDate && !isDone && new Date(task.dueDate) < now;

  const dueDateFormatted = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    : null;

  return (
    <div
      onClick={() => onSelectTask && onSelectTask(task)}
      className="p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-white transition-all cursor-pointer group"
    >
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <span className="font-mono text-[11px] font-black px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 shrink-0 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
          {task.key}
        </span>
        <span
          className={`text-xs font-bold truncate ${
            isDone ? 'line-through text-gray-400' : 'text-gray-900'
          }`}
        >
          {task.title}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto text-xs font-semibold">
        {/* Assignee Avatar / Name */}
        {task.assigneeId?.name && (
          <div className="flex items-center gap-1.5 text-gray-600">
            <div className="w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center text-[10px] font-black">
              {task.assigneeId.name.charAt(0)}
            </div>
            <span className="text-[11px] font-medium hidden md:inline">{task.assigneeId.name}</span>
          </div>
        )}

        {/* Overdue Badge */}
        {isOverdue && (
          <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-0.5 animate-pulse">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Overdue</span>
          </span>
        )}

        {/* Due Date */}
        {dueDateFormatted && (
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <Calendar className="w-3 h-3 text-gray-400" />
            <span>{dueDateFormatted}</span>
          </span>
        )}

        {/* Status Badge */}
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
            task.status === 'DONE'
              ? 'bg-emerald-50 text-emerald-700'
              : task.status === 'IN_PROGRESS'
              ? 'bg-amber-50 text-amber-700'
              : task.status === 'IN_REVIEW'
              ? 'bg-purple-50 text-purple-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {task.status}
        </span>
      </div>
    </div>
  );
};
