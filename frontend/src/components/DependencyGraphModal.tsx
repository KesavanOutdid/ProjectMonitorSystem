'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import {
  GitGraph,
  X,
  Layers,
  ArrowRight,
  ShieldAlert,
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FolderKanban,
  Users,
  Calendar,
  ChevronRight,
  ChevronDown,
  Search,
  Check,
  Bug,
  BookmarkCheck,
  CheckSquare,
  Sparkles,
  Filter,
  Eye,
  Workflow,
  Plus,
  ArrowRightLeft,
  Columns,
  Rows,
  EyeOff,
  Network,
  GitFork
} from 'lucide-react';

interface DependencyGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  onSelectTask: (task: any) => void;
}

export const DependencyGraphModal: React.FC<DependencyGraphModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  onSelectTask
}) => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { projects, currentProject, setCurrentProject } = useAuthStore();
  const [activeProjectId, setActiveProjectId] = useState<string>(
    projectId || currentProject?._id || (projects && projects[0]?._id) || ''
  );

  const [viewMode, setViewMode] = useState<'TREE' | 'DAG'>('TREE');
  const [treeOrientation, setTreeOrientation] = useState<'ORG_CHART' | 'HORIZONTAL' | 'LIST'>('ORG_CHART');
  const [hideEmptySprints, setHideEmptySprints] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('ALL');

  // Expanded nodes state for interactive tree collapse/expand
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [expandedSprints, setExpandedSprints] = useState<Record<string, boolean>>({});

  // Keyboard shortcut (Escape) to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Synchronize active project when prop or currentProject changes
  useEffect(() => {
    if (projectId) {
      setActiveProjectId(projectId);
    } else if (currentProject?._id) {
      setActiveProjectId(currentProject._id);
    } else if (projects && projects.length > 0) {
      setActiveProjectId(projects[0]._id);
    }
  }, [projectId, currentProject?._id, projects]);

  const { data, isLoading } = useQuery({
    queryKey: ['dependency-graph', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return { project: null, teams: [], sprints: [], nodes: [], edges: [] };
      const res = await api.get(`/projects/${activeProjectId}/dependency-graph`);
      return res.data.data;
    },
    enabled: isOpen && !!activeProjectId,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const project = data?.project;
  const teams = data?.teams || [];
  const sprints = data?.sprints || [];
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];

  // Toggle single team branch
  const toggleTeam = (teamKey: string) => {
    setExpandedTeams((prev) => ({
      ...prev,
      [teamKey]: prev[teamKey] === undefined ? false : !prev[teamKey]
    }));
  };

  // Toggle single sprint branch
  const toggleSprint = (sprintKey: string) => {
    setExpandedSprints((prev) => ({
      ...prev,
      [sprintKey]: prev[sprintKey] === undefined ? false : !prev[sprintKey]
    }));
  };

  // Expand all branches
  const handleExpandAll = () => {
    const allTeams: Record<string, boolean> = {};
    teams.forEach((t: any) => {
      allTeams[t.name || t._id] = true;
    });
    allTeams['__unassigned__'] = true;
    setExpandedTeams(allTeams);

    const allSprints: Record<string, boolean> = {};
    sprints.forEach((s: any) => {
      allSprints[s._id] = true;
    });
    allSprints['__backlog__'] = true;
    setExpandedSprints(allSprints);
  };

  // Collapse all branches
  const handleCollapseAll = () => {
    const allTeams: Record<string, boolean> = {};
    teams.forEach((t: any) => {
      allTeams[t.name || t._id] = false;
    });
    allTeams['__unassigned__'] = false;
    setExpandedTeams(allTeams);

    const allSprints: Record<string, boolean> = {};
    sprints.forEach((s: any) => {
      allSprints[s._id] = false;
    });
    allSprints['__backlog__'] = false;
    setExpandedSprints(allSprints);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      case 'IN_PROGRESS':
        return 'bg-amber-50 text-amber-700 border-amber-300';
      case 'IN_REVIEW':
      case 'CODE_REVIEW':
        return 'bg-purple-50 text-purple-700 border-purple-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BUG':
        return <Bug className="w-3 h-3 text-rose-600" />;
      case 'EPIC':
        return <Layers className="w-3 h-3 text-purple-600" />;
      case 'STORY':
        return <BookmarkCheck className="w-3 h-3 text-emerald-600" />;
      default:
        return <CheckSquare className="w-3 h-3 text-blue-600" />;
    }
  };

  const getEdgeLabel = (type: string) => {
    switch (type) {
      case 'blocks':
        return 'Blocks';
      case 'is_blocked_by':
        return 'Blocked by';
      case 'duplicates':
        return 'Duplicates';
      default:
        return 'Relates to';
    }
  };

  // Hierarchical Data Tree computation: Project -> Teams -> Sprints -> Tasks
  const hierarchicalTree = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    // Filter tasks by search query
    const filteredNodes = nodes.filter((node: any) => {
      if (!query) return true;
      const key = (node.key || '').toLowerCase();
      const title = (node.title || '').toLowerCase();
      const assignee = (node.assignee?.name || '').toLowerCase();
      const team = (node.team || '').toLowerCase();
      const sprint = (node.sprint || '').toLowerCase();
      return (
        key.includes(query) ||
        title.includes(query) ||
        assignee.includes(query) ||
        team.includes(query) ||
        sprint.includes(query)
      );
    });

    const cleanStr = (s: string) =>
      (s || '')
        .toLowerCase()
        .replace(/\(\d+\s*stages?\)/gi, '')
        .replace(/[^a-z0-9]/g, '');

    // Determine list of teams to display
    const teamList: any[] = [...teams];

    // If project.teams is empty, dynamically derive teams from nodes
    if (teamList.length === 0) {
      const distinctTeams = Array.from(
        new Set(filteredNodes.map((n: any) => n.team).filter(Boolean))
      );
      distinctTeams.forEach((tmName: any) => {
        teamList.push({
          _id: tmName,
          name: tmName,
          key: (tmName || 'TM').slice(0, 3).toUpperCase(),
          color: '#2563EB',
          icon: '👥',
          description: 'Team discipline workspace'
        });
      });
    }

    const teamNamesClean = new Set(teamList.map((t: any) => cleanStr(t.name)));

    // Collect orphan tasks that don't match any configured team
    const unassignedTasks = filteredNodes.filter((node: any) => {
      if (!node.team) return true;
      const c = cleanStr(node.team);
      return !teamNamesClean.has(c);
    });

    // Build hierarchical branches
    const branches = teamList
      .filter((tm: any) => {
        if (selectedTeamFilter === 'ALL') return true;
        return (
          tm.name === selectedTeamFilter ||
          tm._id === selectedTeamFilter ||
          cleanStr(tm.name) === cleanStr(selectedTeamFilter)
        );
      })
      .map((team: any) => {
        const teamClean = cleanStr(team.name);
        const teamKeyClean = cleanStr(team.key);

        // Tasks for this team
        const teamTasks = filteredNodes.filter((node: any) => {
          if (!node.team) return false;
          const tClean = cleanStr(node.team);
          return (
            tClean === teamClean ||
            tClean.includes(teamClean) ||
            teamClean.includes(tClean) ||
            (teamKeyClean && tClean === teamKeyClean)
          );
        });

        // Sprints under this team
        let teamSprints = sprints.map((sprint: any) => {
          const sprintTasks = teamTasks.filter((t: any) => {
            const matchId =
              (t.sprintId && sprint._id && String(t.sprintId) === String(sprint._id)) ||
              (t.sprintId && sprint.id && String(t.sprintId) === String(sprint.id));
            if (matchId) return true;
            if (t.sprint && sprint.name) {
              const tSpClean = cleanStr(t.sprint);
              const spNameClean = cleanStr(sprint.name);
              return (
                tSpClean === spNameClean ||
                tSpClean.includes(spNameClean) ||
                spNameClean.includes(tSpClean)
              );
            }
            return false;
          });

          const completed = sprintTasks.filter((t: any) => t.status === 'DONE').length;
          const total = sprintTasks.length;
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

          return {
            ...sprint,
            tasks: sprintTasks,
            totalTasks: total,
            completedTasks: completed,
            percentComplete: percent
          };
        });

        // Optional filter to hide empty planned sprints
        if (hideEmptySprints) {
          teamSprints = teamSprints.filter((s: any) => s.totalTasks > 0 || s.status === 'ACTIVE');
        }

        // Backlog tasks for this team (not assigned to any listed sprint)
        const sprintIds = new Set(sprints.map((s: any) => String(s._id)));
        const backlogTasks = teamTasks.filter((t: any) => {
          if (t.sprintId && sprintIds.has(String(t.sprintId))) return false;
          if (
            t.sprint &&
            sprints.some((s: any) => {
              const tSpClean = cleanStr(t.sprint);
              const spNameClean = cleanStr(s.name);
              return (
                tSpClean === spNameClean ||
                tSpClean.includes(spNameClean) ||
                spNameClean.includes(tSpClean)
              );
            })
          ) {
            return false;
          }
          return true;
        });

        const totalTeamTasks = teamTasks.length;
        const totalTeamCompleted = teamTasks.filter((t: any) => t.status === 'DONE').length;
        const teamPercent =
          totalTeamTasks > 0 ? Math.round((totalTeamCompleted / totalTeamTasks) * 100) : 0;

        return {
          id: team._id || team.name,
          name: team.name,
          key: team.key || (team.name ? team.name.slice(0, 3).toUpperCase() : 'TM'),
          color: team.color || '#3B82F6',
          icon: team.icon || '👥',
          description: team.description || '',
          totalTasks: totalTeamTasks,
          completedTasks: totalTeamCompleted,
          percentComplete: teamPercent,
          sprints: teamSprints,
          backlogTasks
        };
      });

    // Add unassigned team branch if orphan tasks exist
    if (
      unassignedTasks.length > 0 &&
      (selectedTeamFilter === 'ALL' || selectedTeamFilter === 'UNASSIGNED')
    ) {
      const completed = unassignedTasks.filter((t: any) => t.status === 'DONE').length;
      let unassignedSprints = sprints.map((sprint: any) => {
        const sprintTasks = unassignedTasks.filter((t: any) => {
          const matchId =
            (t.sprintId && sprint._id && String(t.sprintId) === String(sprint._id)) ||
            (t.sprintId && sprint.id && String(t.sprintId) === String(sprint.id));
          if (matchId) return true;
          if (t.sprint && sprint.name) {
            const tSpClean = cleanStr(t.sprint);
            const spNameClean = cleanStr(sprint.name);
            return (
              tSpClean === spNameClean ||
              tSpClean.includes(spNameClean) ||
              spNameClean.includes(tSpClean)
            );
          }
          return false;
        });
        return {
          ...sprint,
          tasks: sprintTasks,
          totalTasks: sprintTasks.length,
          completedTasks: sprintTasks.filter((t: any) => t.status === 'DONE').length,
          percentComplete:
            sprintTasks.length > 0
              ? Math.round(
                  (sprintTasks.filter((t: any) => t.status === 'DONE').length /
                    sprintTasks.length) *
                    100
                )
              : 0
        };
      });

      if (hideEmptySprints) {
        unassignedSprints = unassignedSprints.filter((s: any) => s.totalTasks > 0 || s.status === 'ACTIVE');
      }

      branches.push({
        id: '__unassigned__',
        name: 'General / Core Tasks',
        key: 'GEN',
        color: '#64748B',
        icon: '📁',
        description: 'Tasks not bound to a specific discipline team',
        totalTasks: unassignedTasks.length,
        completedTasks: completed,
        percentComplete: Math.round((completed / unassignedTasks.length) * 100),
        sprints: unassignedSprints,
        backlogTasks: unassignedTasks.filter((t: any) => {
          if (t.sprintId && sprints.some((s: any) => String(s._id) === String(t.sprintId)))
            return false;
          if (
            t.sprint &&
            sprints.some((s: any) => {
              const tSpClean = cleanStr(t.sprint);
              const spNameClean = cleanStr(s.name);
              return (
                tSpClean === spNameClean ||
                tSpClean.includes(spNameClean) ||
                spNameClean.includes(tSpClean)
              );
            })
          ) {
            return false;
          }
          return true;
        })
      });
    }

    return branches;
  }, [nodes, teams, sprints, searchQuery, selectedTeamFilter, hideEmptySprints]);

  if (!isOpen) return null;

  const displayProjectName =
    project?.name ||
    projectName ||
    projects?.find((p) => p._id === activeProjectId)?.name ||
    'Project Overview';
  const displayProjectKey =
    project?.key || projects?.find((p) => p._id === activeProjectId)?.key || 'PROJ';

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none animate-fade-in"
    >
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden text-[#111827] relative my-auto">
        {/* Top Header Bar: Title, Project Switcher & Fixed Close Button */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/95 sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Workflow className="w-5 h-5 text-blue-400" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-[#111827]">
                  Project Hierarchy &amp; Dependency Graph
                </h3>

                {/* Project Switcher Dropdown */}
                {projects && projects.length > 1 && (
                  <select
                    value={activeProjectId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setActiveProjectId(newId);
                      const matched = projects.find((p) => p._id === newId);
                      if (matched) setCurrentProject(matched);
                    }}
                    className="bg-white border border-slate-200 hover:border-blue-400 rounded-lg px-2.5 py-0.5 text-xs font-semibold text-blue-600 outline-none cursor-pointer shadow-2xs"
                  >
                    {projects.map((proj) => (
                      <option key={proj._id} value={proj._id}>
                        {proj.name} ({proj.key})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <p className="text-xs text-slate-500 hidden sm:block mt-0.5">
                Interactive Multi-Tier Tree (Project → Teams → Sprints → Tasks) &amp; Blocker DAG.
              </p>
            </div>
          </div>

          {/* Dedicated High-Visibility Close Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-500 text-slate-700 hover:text-white border border-slate-200 hover:border-rose-500 transition-all shadow-xs cursor-pointer font-semibold text-xs shrink-0 group"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-4 h-4 group-hover:rotate-90 transition-transform text-slate-500 group-hover:text-white" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Controls & Tools Toolbar */}
        <div className="px-4 py-2 sm:px-6 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center flex-wrap gap-2.5">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setViewMode('TREE')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'TREE'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GitFork className="w-3.5 h-3.5 text-blue-600" />
                <span>Tree Graph</span>
              </button>
              <button
                onClick={() => setViewMode('DAG')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'DAG'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GitGraph className="w-3.5 h-3.5 text-purple-600" />
                <span>Dependency DAG</span>
              </button>
            </div>

            {/* Tree Orientation Switcher */}
            {viewMode === 'TREE' && (
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setTreeOrientation('ORG_CHART')}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    treeOrientation === 'ORG_CHART'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Org Chart (Project Top → Teams Row → Sprints Row → Tasks)"
                >
                  <Network className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Org Chart</span>
                </button>
                <button
                  onClick={() => setTreeOrientation('HORIZONTAL')}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    treeOrientation === 'HORIZONTAL'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Side by Side (Left → Right Horizontal Flow)"
                >
                  <Columns className="w-3.5 h-3.5 text-blue-600" />
                  <span className="hidden sm:inline">Side Flow</span>
                </button>
                <button
                  onClick={() => setTreeOrientation('LIST')}
                  className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    treeOrientation === 'LIST'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="List Tree (Vertical Accordion)"
                >
                  <Rows className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tasks, keys, teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 w-44 sm:w-56 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Team Filter Dropdown */}
            {teams.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedTeamFilter}
                  onChange={(e) => setSelectedTeamFilter(e.target.value)}
                  className="bg-slate-50 hover:bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Teams ({teams.length})</option>
                  {teams.map((tm: any) => (
                    <option key={tm._id || tm.name} value={tm.name}>
                      {tm.name}
                    </option>
                  ))}
                  <option value="UNASSIGNED">Unassigned Tasks</option>
                </select>
              </div>
            )}

            {/* Sprints Filter Toggle */}
            {viewMode === 'TREE' && (
              <button
                onClick={() => setHideEmptySprints(!hideEmptySprints)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                  hideEmptySprints
                    ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {hideEmptySprints ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{hideEmptySprints ? 'Active Sprints' : 'All Sprints'}</span>
              </button>
            )}
          </div>

          {/* Right Controls: Zoom & Expand / Collapse */}
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 px-1 py-0.5 rounded-xl shadow-2xs">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.1))}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-bold text-slate-500 px-1 w-10 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {viewMode === 'TREE' && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExpandAll}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  Expand All
                </button>
                <button
                  onClick={handleCollapseAll}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                >
                  Collapse All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Canvas Body */}
        <div className="flex-1 bg-slate-100/70 p-4 sm:p-6 overflow-auto relative dark-scrollbar">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 font-medium gap-2">
              <Workflow className="w-8 h-8 text-blue-500 animate-spin" />
              <span>Generating interactive project hierarchy graph...</span>
            </div>
          ) : viewMode === 'TREE' ? (
            /* ========================================================================= */
            /* 1. HIERARCHY TREE VIEW: ORG-CHART / SIDE-BY-SIDE / LIST                   */
            /* ========================================================================= */
            <div
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
              className="transition-transform duration-150 pb-20 min-w-max flex flex-col items-center mx-auto"
            >
              {treeOrientation === 'ORG_CHART' ? (
                /* ─── 1. ORG-CHART VIEW: Project (Top) -> Teams (Row) -> Sprints (Row) -> Tasks (Cards) ─── */
                <div className="flex flex-col items-center gap-8 w-full">
                  {/* LEVEL 0: PROJECT ROOT NODE (Top Center) */}
                  <div className="flex flex-col items-center relative">
                    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-700 w-96 flex flex-col gap-3.5 z-20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center font-bold text-lg shrink-0">
                            <FolderKanban className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
                              {displayProjectKey}
                            </span>
                            <h2 className="text-sm font-bold text-white mt-1 truncate max-w-[200px]">
                              {displayProjectName}
                            </h2>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-400">
                            {nodes.filter((t: any) => t.status === 'DONE').length}/{nodes.length}
                          </span>
                          <p className="text-[10px] text-slate-400 uppercase">Tasks Done</p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="flex justify-between text-[10px] font-semibold text-slate-300 mb-1">
                          <span>Project Health</span>
                          <span>
                            {nodes.length > 0
                              ? Math.round(
                                  (nodes.filter((t: any) => t.status === 'DONE').length /
                                    nodes.length) *
                                    100
                                )
                              : 0}
                            %
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{
                              width: `${
                                nodes.length > 0
                                  ? (nodes.filter((t: any) => t.status === 'DONE').length /
                                      nodes.length) *
                                    100
                                  : 0
                              }%`
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Stem coming down from Project Root */}
                    <div className="w-[2px] h-8 bg-blue-500" />
                  </div>

                  {/* LEVEL 1: TEAMS ROW (SIDE BY SIDE UNDER PROJECT) */}
                  <div className="flex flex-row items-start justify-center gap-10 relative pt-2">
                    {hierarchicalTree.length === 0 ? (
                      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 max-w-md text-xs text-slate-500">
                        No teams or tasks match the search criteria.
                      </div>
                    ) : (
                      hierarchicalTree.map((teamBranch: any) => {
                        const isTeamExpanded = expandedTeams[teamBranch.id] !== false;

                        return (
                          <div
                            key={teamBranch.id}
                            className="flex flex-col items-center gap-6 min-w-[320px] max-w-full relative"
                          >
                            {/* Stem coming down into Team Node */}
                            <div className="w-[2px] h-6 bg-slate-300 -mt-8" />

                            {/* TEAM CARD (Level 1) */}
                            <div
                              onClick={() => toggleTeam(teamBranch.id)}
                              className="w-80 bg-white border-2 hover:border-blue-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 group/team relative z-10"
                              style={{ borderColor: teamBranch.color }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shadow-2xs shrink-0"
                                    style={{ backgroundColor: teamBranch.color }}
                                  >
                                    {teamBranch.key.slice(0, 2)}
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-700">
                                      {teamBranch.key}
                                    </span>
                                    <h4 className="text-xs font-bold text-slate-900 mt-0.5 line-clamp-1">
                                      {teamBranch.name}
                                    </h4>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  className="p-1 rounded-lg bg-slate-100 group-hover/team:bg-blue-50 text-slate-600 group-hover/team:text-blue-600 transition-colors"
                                >
                                  {isTeamExpanded ? (
                                    <ChevronDown className="w-4 h-4" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                              </div>

                              <div className="pt-2 border-t border-slate-100">
                                <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                                  <span>{teamBranch.percentComplete}% done</span>
                                  <span>
                                    {teamBranch.completedTasks}/{teamBranch.totalTasks} tasks
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: `${teamBranch.percentComplete}%`,
                                      backgroundColor: teamBranch.color
                                    }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* LEVEL 2 & 3: SPRINTS & TASKS (UNDER THIS TEAM) */}
                            {isTeamExpanded && (
                              <div className="flex flex-col items-center gap-6 w-full relative">
                                <div className="w-[2px] h-6 bg-blue-300 -mt-6" />

                                <div className="flex flex-row items-start justify-center gap-6 flex-wrap">
                                  {teamBranch.sprints.map((sprintBranch: any) => {
                                    const sprintKey = `${teamBranch.id}-${sprintBranch._id}`;
                                    const isSprintExpanded = expandedSprints[sprintKey] !== false;
                                    const isSprintActive = sprintBranch.status === 'ACTIVE';

                                    return (
                                      <div
                                        key={sprintBranch._id}
                                        className="flex flex-col items-center gap-3 w-72 shrink-0 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs"
                                      >
                                        {/* SPRINT CARD (Level 2) */}
                                        <div
                                          onClick={() => toggleSprint(sprintKey)}
                                          className={`w-full p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                                            isSprintActive
                                              ? 'bg-blue-50 border-blue-300 shadow-2xs'
                                              : 'bg-white border-slate-200 hover:border-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-1.5">
                                            <div className="flex items-center gap-2 truncate">
                                              <Calendar
                                                className={`w-4 h-4 shrink-0 ${
                                                  isSprintActive
                                                    ? 'text-blue-600'
                                                    : 'text-slate-400'
                                                }`}
                                              />
                                              <h5 className="text-xs font-bold text-slate-900 truncate">
                                                {sprintBranch.name}
                                              </h5>
                                            </div>
                                            <button
                                              type="button"
                                              className="p-0.5 text-slate-500 hover:text-slate-800"
                                            >
                                              {isSprintExpanded ? (
                                                <ChevronDown className="w-3.5 h-3.5" />
                                              ) : (
                                                <ChevronRight className="w-3.5 h-3.5" />
                                              )}
                                            </button>
                                          </div>

                                          <div className="flex items-center justify-between text-[10px]">
                                            <span
                                              className={`font-bold px-2 py-0.5 rounded-md uppercase ${
                                                isSprintActive
                                                  ? 'bg-blue-600 text-white'
                                                  : sprintBranch.status === 'COMPLETED'
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : 'bg-slate-200 text-slate-700'
                                              }`}
                                            >
                                              {sprintBranch.status}
                                            </span>
                                            <span className="font-semibold text-slate-500">
                                              {sprintBranch.totalTasks}{' '}
                                              {sprintBranch.totalTasks === 1 ? 'task' : 'tasks'}
                                            </span>
                                          </div>
                                        </div>

                                        {/* LEVEL 3: TASK CARDS (STACKED UNDER SPRINT) */}
                                        {isSprintExpanded && (
                                          <div className="flex flex-col gap-2.5 w-full pt-1">
                                            {sprintBranch.tasks.length === 0 ? (
                                              <div className="p-3 text-center text-xs text-slate-400 italic bg-white rounded-xl border border-slate-200">
                                                No tasks in sprint.
                                              </div>
                                            ) : (
                                              sprintBranch.tasks.map((task: any) => (
                                                <div
                                                  key={task._id || task.id}
                                                  onClick={() => onSelectTask(task)}
                                                  className="w-full bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-400 rounded-xl p-3 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-2 group/task"
                                                >
                                                  <div className="flex items-center justify-between gap-1.5">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                      {getTypeIcon(task.issueType)}
                                                      <span className="font-mono text-[11px] font-bold text-slate-900 group-hover/task:text-blue-600">
                                                        {task.key}
                                                      </span>
                                                    </div>
                                                    <span
                                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${getStatusColor(
                                                        task.status
                                                      )}`}
                                                    >
                                                      {task.status}
                                                    </span>
                                                  </div>

                                                  <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">
                                                    {task.title}
                                                  </p>

                                                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
                                                    <span className="font-medium capitalize">
                                                      {task.priority || 'Normal'}
                                                    </span>
                                                    {task.assignee ? (
                                                      <div className="flex items-center gap-1">
                                                        <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[9px] text-slate-700 uppercase">
                                                          {(task.assignee.name || 'U').charAt(0)}
                                                        </span>
                                                        <span className="truncate max-w-[90px]">
                                                          {task.assignee.name}
                                                        </span>
                                                      </div>
                                                    ) : (
                                                      <span className="text-slate-400 italic">
                                                        Unassigned
                                                      </span>
                                                    )}
                                                  </div>
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}

                                  {/* Backlog Items Column under this Team */}
                                  {teamBranch.backlogTasks && teamBranch.backlogTasks.length > 0 && (
                                    <div className="flex flex-col items-center gap-3 w-72 shrink-0 bg-slate-100/90 p-3.5 rounded-2xl border border-slate-200">
                                      <div
                                        onClick={() => toggleSprint(`${teamBranch.id}-backlog`)}
                                        className="w-full p-3 bg-white rounded-xl border border-slate-200 transition-all cursor-pointer flex items-center justify-between"
                                      >
                                        <div className="flex items-center gap-2">
                                          <button type="button" className="p-0.5 text-slate-500">
                                            {expandedSprints[`${teamBranch.id}-backlog`] !== false ? (
                                              <ChevronDown className="w-3.5 h-3.5" />
                                            ) : (
                                              <ChevronRight className="w-3.5 h-3.5" />
                                            )}
                                          </button>
                                          <span className="text-xs font-bold text-slate-700">
                                            Product Backlog
                                          </span>
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-500">
                                          {teamBranch.backlogTasks.length} items
                                        </span>
                                      </div>

                                      {expandedSprints[`${teamBranch.id}-backlog`] !== false && (
                                        <div className="flex flex-col gap-2.5 w-full pt-1">
                                          {teamBranch.backlogTasks.map((task: any) => (
                                            <div
                                              key={task._id || task.id}
                                              onClick={() => onSelectTask(task)}
                                              className="w-full bg-white hover:bg-blue-50/40 border border-slate-200 hover:border-blue-400 rounded-xl p-3 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-2 group/task"
                                            >
                                              <div className="flex items-center justify-between gap-1.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                  {getTypeIcon(task.issueType)}
                                                  <span className="font-mono text-[11px] font-bold text-slate-900 group-hover/task:text-blue-600">
                                                    {task.key}
                                                  </span>
                                                </div>
                                                <span
                                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 ${getStatusColor(
                                                    task.status
                                                  )}`}
                                                >
                                                  {task.status}
                                                </span>
                                              </div>
                                              <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug">
                                                {task.title}
                                              </p>
                                              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
                                                <span className="font-medium capitalize">
                                                  {task.priority || 'Normal'}
                                                </span>
                                                {task.assignee ? (
                                                  <span className="truncate max-w-[90px]">
                                                    {task.assignee.name}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-400 italic">
                                                    Unassigned
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : treeOrientation === 'HORIZONTAL' ? (
                /* ─── 2. SIDE-BY-SIDE FLOW VIEW ─── */
                <div className="flex flex-row items-start gap-10 min-w-max">
                  {/* ROOT COLUMN: Project Card (Leftmost) */}
                  <div className="w-72 shrink-0 sticky top-0 flex flex-col gap-3">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                      <span>Project Root</span>
                    </span>

                    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-5 rounded-2xl shadow-xl border border-slate-700 flex flex-col gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-600/30 border border-blue-400/40 text-blue-300 flex items-center justify-center font-bold text-lg shrink-0">
                          <FolderKanban className="w-5 h-5" />
                        </div>
                        <div className="truncate">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
                            {displayProjectKey}
                          </span>
                          <h2 className="text-sm font-bold text-white mt-1 truncate">
                            {displayProjectName}
                          </h2>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/80 text-xs">
                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Total</p>
                          <p className="text-base font-bold text-white mt-0.5">{nodes.length}</p>
                        </div>
                        <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700">
                          <p className="text-[10px] text-emerald-400 uppercase font-semibold">Done</p>
                          <p className="text-base font-bold text-emerald-400 mt-0.5">
                            {nodes.filter((t: any) => t.status === 'DONE').length}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TEAMS → SPRINTS → TASKS */}
                  <div className="flex flex-col gap-8 flex-1">
                    {hierarchicalTree.map((teamBranch: any) => {
                      const isTeamExpanded = expandedTeams[teamBranch.id] !== false;

                      return (
                        <div
                          key={teamBranch.id}
                          className="flex flex-row items-start gap-8 bg-white/70 p-4 rounded-3xl border border-slate-200/90 shadow-xs"
                        >
                          <div className="w-72 shrink-0 flex flex-col gap-2">
                            <div
                              onClick={() => toggleTeam(teamBranch.id)}
                              className="bg-white border-2 hover:border-blue-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col gap-3 group/team"
                              style={{ borderColor: teamBranch.color }}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900">{teamBranch.name}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                                  {teamBranch.totalTasks} tasks
                                </span>
                              </div>
                            </div>
                          </div>

                          {isTeamExpanded && (
                            <div className="flex flex-col gap-4 flex-1">
                              {teamBranch.sprints.map((sprintBranch: any) => {
                                const sprintKey = `${teamBranch.id}-${sprintBranch._id}`;
                                const isSprintExpanded = expandedSprints[sprintKey] !== false;

                                return (
                                  <div
                                    key={sprintBranch._id}
                                    className="flex flex-row items-start gap-4 p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs"
                                  >
                                    <div
                                      onClick={() => toggleSprint(sprintKey)}
                                      className="w-64 shrink-0 p-3.5 rounded-xl border bg-slate-50 border-slate-200 cursor-pointer flex justify-between"
                                    >
                                      <span className="text-xs font-bold text-slate-900">{sprintBranch.name}</span>
                                      <span className="text-xs text-slate-500">{sprintBranch.totalTasks} items</span>
                                    </div>

                                    {isSprintExpanded && (
                                      <div className="flex-1 flex flex-row flex-wrap gap-2.5">
                                        {sprintBranch.tasks.map((task: any) => (
                                          <div
                                            key={task._id}
                                            onClick={() => onSelectTask(task)}
                                            className="w-64 bg-white border border-slate-200 rounded-xl p-3 shadow-2xs hover:border-blue-400 cursor-pointer"
                                          >
                                            <span className="text-xs font-mono font-bold text-blue-600">{task.key}</span>
                                            <p className="text-xs font-semibold text-slate-800 line-clamp-1">{task.title}</p>
                                          </div>
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
                </div>
              ) : (
                /* ─── 3. LIST ACCORDION VIEW ─── */
                <div className="flex flex-col gap-6 w-full max-w-4xl">
                  {hierarchicalTree.map((teamBranch: any) => {
                    const isTeamExpanded = expandedTeams[teamBranch.id] !== false;

                    return (
                      <div key={teamBranch.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                        <div
                          onClick={() => toggleTeam(teamBranch.id)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <span className="text-xs font-bold text-slate-900">{teamBranch.name}</span>
                          <span className="text-xs text-slate-500">{teamBranch.totalTasks} tasks</span>
                        </div>

                        {isTeamExpanded && (
                          <div className="flex flex-col gap-3 pt-4 pl-4 border-l-2 border-slate-100 mt-3">
                            {teamBranch.sprints.map((sprintBranch: any) => (
                              <div key={sprintBranch._id} className="bg-slate-50 p-3 rounded-xl">
                                <span className="text-xs font-bold">{sprintBranch.name}</span>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  {sprintBranch.tasks.map((task: any) => (
                                    <div
                                      key={task._id}
                                      onClick={() => onSelectTask(task)}
                                      className="p-2.5 bg-white rounded-lg border border-slate-200 cursor-pointer"
                                    >
                                      <span className="font-mono text-xs font-bold">{task.key}</span>
                                      <p className="text-xs text-slate-700">{task.title}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* 2. DEPENDENCY DAG GRAPH VIEW: Blockers & Links                             */
            /* ========================================================================= */
            <div
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
              className="transition-transform duration-150 flex flex-col gap-6 min-w-[720px] pb-12"
            >
              {/* Connected Dependency Pairs / Chains */}
              {edges.length > 0 ? (
                <div className="flex flex-col gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                    <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>Active Dependency Blockers & Links ({edges.length})</span>
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {edges.map((edge: any) => {
                      const srcNode = nodes.find(
                        (n: any) => n.id === edge.source || n._id === edge.source
                      );
                      const tgtNode = nodes.find(
                        (n: any) => n.id === edge.target || n._id === edge.target
                      );

                      if (!srcNode || !tgtNode) return null;

                      return (
                        <div
                          key={edge.id}
                          className="flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50/40 rounded-xl border border-slate-200 hover:border-blue-300 shadow-2xs transition-all"
                        >
                          {/* Source Node */}
                          <div
                            onClick={() => onSelectTask(srcNode)}
                            className="flex items-center gap-1.5 cursor-pointer group min-w-0"
                          >
                            <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-blue-600">
                              {srcNode.key}
                            </span>
                            <span className="text-xs text-slate-600 truncate max-w-[110px]">
                              {srcNode.title}
                            </span>
                          </div>

                          {/* Link Edge Pill */}
                          <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 rounded-full text-[10px] font-bold border border-amber-300 mx-2 shrink-0">
                            <span>{getEdgeLabel(edge.type)}</span>
                            <ArrowRight className="w-3 h-3 text-amber-700" />
                          </div>

                          {/* Target Node */}
                          <div
                            onClick={() => onSelectTask(tgtNode)}
                            className="flex items-center gap-1.5 cursor-pointer group min-w-0"
                          >
                            <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-blue-600">
                              {tgtNode.key}
                            </span>
                            <span className="text-xs text-slate-600 truncate max-w-[110px]">
                              {tgtNode.title}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                      <LinkIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">
                        No active blocker links configured yet
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        You can link dependencies and blocker chains by clicking any task card below and adding an issue link (e.g., &quot;blocks&quot; or &quot;is blocked by&quot;).
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* All Nodes Grid */}
              <div className="flex flex-col gap-3">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  All Project Tasks ({nodes.length})
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {nodes.map((node: any) => {
                    const hasBlockers = edges.some(
                      (e: any) =>
                        (e.target === node.id || e.target === node._id) && e.type === 'blocks'
                    );

                    return (
                      <div
                        key={node.id || node._id}
                        onClick={() => onSelectTask(node)}
                        className={`bg-white p-3.5 rounded-2xl border ${
                          hasBlockers
                            ? 'border-rose-300 ring-2 ring-rose-100'
                            : 'border-slate-200 hover:border-blue-400'
                        } shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer flex flex-col gap-2`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {getTypeIcon(node.issueType)}
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {node.key}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${getStatusColor(
                              node.status
                            )}`}
                          >
                            {node.status}
                          </span>
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 line-clamp-2">
                          {node.title}
                        </h4>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                          <span>
                            Priority: <strong className="capitalize">{node.priority}</strong>
                          </span>
                          {node.assignee && (
                            <span className="font-medium truncate max-w-[80px]">
                              {node.assignee.name}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
