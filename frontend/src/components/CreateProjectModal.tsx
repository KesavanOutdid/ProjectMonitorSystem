import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { X, FolderPlus, Plus, Trash2, Edit3, Sparkles, Check, UserCheck, Shield, Users } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DynamicTeam {
  id: string;
  name: string;
  key: string;
  color: string;
  memberIds: string[];
}

const COLOR_PALETTE = [
  '#0284C7', // Sky Blue
  '#9333EA', // Purple
  '#16A34A', // Green
  '#EA580C', // Orange
  '#E11D48', // Rose
  '#6366F1', // Indigo
  '#0D9488', // Teal
  '#475569'  // Slate
];

const generateSmartKey = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '';
  const words = trimmed.split(/[\s\-_]+/);
  if (words.length > 1) {
    return words.map((w) => w[0] || '').join('').toUpperCase().slice(0, 5);
  }
  return (trimmed[0] || '').toUpperCase();
};

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose }) => {
  const queryClient = useQueryClient();
  const { currentWorkspace, fetchProjects, setCurrentProject, user } = useAuthStore();

  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [isKeyManuallyEdited, setIsKeyManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0284C7');
  const [leadId, setLeadId] = useState('');
  const [showAllMembersMap, setShowAllMembersMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      setName('');
      setKey('');
      setIsKeyManuallyEdited(false);
      setDescription('');
      const randomColor = COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
      setColor(randomColor);
      setLeadId('');
      setTeams([]);
      setShowAllMembersMap({});
    }
  }, [isOpen]);

  // Fetch Workspace Members to assign Project Manager & team members
  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', currentWorkspace?._id],
    queryFn: async () => {
      if (!currentWorkspace?._id) return [];
      const res = await api.get(`/workspaces/${currentWorkspace._id}/members`);
      return res.data.data || [];
    },
    enabled: !!currentWorkspace?._id
  });

  const isAuthorized = user?.role === 'SUPER_ADMIN' || user?.role === 'ORG_ADMIN' || user?.role === 'PROJECT_MANAGER';

  // Filter strictly for Project Managers (and Org/Super Admins who can manage projects)
  const projectManagerCandidates = members.filter((m: any) => {
    const r = (m.role || m.userId?.role || '').toUpperCase();
    return r === 'PROJECT_MANAGER' || r === 'ORG_ADMIN' || r === 'SUPER_ADMIN';
  });

  const availableManagers = projectManagerCandidates;

  // Dynamic Teams List (Starts clean, dynamic)
  const [teams, setTeams] = useState<DynamicTeam[]>([]);

  // Fetch Existing Organization Teams from Workspace
  const { data: orgTeams = [] } = useQuery({
    queryKey: ['workspace-teams', currentWorkspace?._id],
    queryFn: async () => {
      if (!currentWorkspace?._id) return [];
      const res = await api.get(`/teams?workspaceId=${currentWorkspace._id}`);
      return res.data.data || [];
    },
    enabled: !!currentWorkspace?._id
  });

  const handleRemoveTeam = (id: string) => {
    setTeams(teams.filter((t) => t.id !== id));
  };

  const handleUpdateTeamName = (id: string, newName: string) => {
    setTeams(
      teams.map((t) => {
        if (t.id === id) {
          const autoKey = generateSmartKey(newName) || t.key;
          return { ...t, name: newName, key: autoKey };
        }
        return t;
      })
    );
  };

  const handleUpdateTeamColor = (id: string, newColor: string) => {
    setTeams(teams.map((t) => (t.id === id ? { ...t, color: newColor } : t)));
  };

  // Helper to toggle a member for a team
  const handleToggleMember = (teamId: string, memberId: string) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const current = t.memberIds || [];
        const updated = current.includes(memberId)
          ? current.filter((id) => id !== memberId)
          : [...current, memberId];
        return { ...t, memberIds: updated };
      })
    );
  };

  // Helper to select all candidate members for a team
  const handleSelectAllMembers = (teamId: string, candidateIds?: string[]) => {
    if (candidateIds && candidateIds.length > 0) {
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, memberIds: Array.from(new Set([...(t.memberIds || []), ...candidateIds])) } : t))
      );
    } else {
      const allIds = members.map((m: any) => {
        const mId = (typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id);
        return mId.toString();
      });
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? { ...t, memberIds: Array.from(new Set(allIds)) } : t))
      );
    }
  };

  // Helper to clear members for a team
  const handleClearMembers = (teamId: string, candidateIds?: string[]) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        if (!candidateIds || candidateIds.length === 0) {
          return { ...t, memberIds: [] };
        }
        return {
          ...t,
          memberIds: (t.memberIds || []).filter((id) => !candidateIds.includes(id))
        };
      })
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const teamsPayload = teams
        .filter((t) => t.name.trim().length > 0)
        .map((t) => ({
          name: t.name.trim(),
          key: t.key.trim().toUpperCase() || 'TEAM',
          color: t.color || '#0284C7',
          members: t.memberIds || []
        }));

      const res = await api.post('/projects', {
        name,
        key: key.toUpperCase(),
        description,
        color,
        leadId: leadId || undefined,
        teams: teamsPayload,
        workspaceId: currentWorkspace?._id
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (currentWorkspace?._id) {
        fetchProjects(currentWorkspace._id);
      }
      if (data?.data) {
        setCurrentProject(data.data);
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to create project');
    }
  });

  if (!isOpen || !isAuthorized) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#0F172A]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-[#0F172A]/10 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-slide-up">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#0F172A]/10 flex items-center justify-between bg-[#F3F4F6]/80 shrink-0">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-[#0F172A]" />
            <div>
              <h2 className="text-sm font-bold text-[#111827]">Create New Project</h2>
              <p className="text-[11px] text-gray-500">Define project details, project manager, and engineering teams</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#111827]/50 hover:text-[#111827] rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="p-6 overflow-y-auto flex flex-col gap-4.5"
        >
          {/* Project Name */}
          <div>
            <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1">
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="Enter project name"
              value={name}
              onChange={(e) => {
                const newName = e.target.value;
                setName(newName);
                if (!isKeyManuallyEdited) {
                  setKey(generateSmartKey(newName));
                }
              }}
              className="w-full px-3.5 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] text-[#111827] font-medium"
            />
          </div>

          {/* Assigned Project Manager (Filtered to PMs) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#0F172A]" />
                <span>Assigned Project Manager</span>
              </label>
              <span className="text-[10px] text-gray-500 font-medium">
                {projectManagerCandidates.length > 0 ? `${projectManagerCandidates.length} PM(s) available` : 'Workspace members'}
              </span>
            </div>
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] text-[#111827] font-medium"
            >
              <option value="">
                {user?.role === 'PROJECT_MANAGER'
                  ? `Select Project Manager (Default: ${user?.name || 'You'})`
                  : availableManagers.length > 0
                  ? 'Select Project Manager...'
                  : 'No Project Managers available'}
              </option>
              {availableManagers.map((m: any) => {
                const id = (typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id);
                const memberName = m.name || (typeof m.userId === 'object' && m.userId?.name) || (m.email ? m.email.split('@')[0] : 'Member');
                const memberRole = m.role || (typeof m.userId === 'object' && m.userId?.role) || m.jobTitle || 'PROJECT_MANAGER';
                return (
                  <option key={id} value={id}>
                    {memberName} • [{memberRole.replace(/_/g, ' ')}]
                  </option>
                );
              })}
            </select>
          </div>

          {/* Project Key */}
          <div>
            <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1">
              Project Key *
            </label>
            <input
              type="text"
              required
              maxLength={6}
              placeholder="e.g. PRJ"
              value={key}
              onChange={(e) => {
                setIsKeyManuallyEdited(true);
                setKey(e.target.value.toUpperCase());
              }}
              className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] text-[#111827]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[#111827] uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Brief description of the project goals and deliverables..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-[#F3F4F6] border border-[#0F172A]/10 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] text-[#111827]"
            />
          </div>

          {/* Dynamic Project Teams Section */}
          <div className="pt-2 border-t border-gray-100 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#111827] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Specialized Teams & Stages ({teams.length})</span>
              </label>
              {teams.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTeams([])}
                  className="text-[11px] text-gray-400 hover:text-rose-600 font-medium cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Organization Teams (Workspace Dynamic) */}
            {orgTeams.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                  Organization Teams (Click to Add):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {orgTeams.map((ot: any) => {
                    const isIncluded = teams.some(
                      (t) => t.name.toLowerCase() === ot.name.toLowerCase()
                    );
                    return (
                      <button
                        key={ot._id}
                        type="button"
                        onClick={() => {
                          if (isIncluded) {
                            setTeams(teams.filter((t) => t.name.toLowerCase() !== ot.name.toLowerCase()));
                          } else {
                            const orgMemberIds = Array.isArray(ot.members)
                              ? ot.members.map((m: any) => {
                                  if (typeof m === 'object' && m?._id) return m._id.toString();
                                  if (typeof m === 'object' && m?.userId) return (m.userId._id || m.userId).toString();
                                  return m.toString();
                                })
                              : [];
                            if (ot.leadId) {
                              const leadIdStr = (typeof ot.leadId === 'object' && ot.leadId?._id) ? ot.leadId._id.toString() : ot.leadId?.toString();
                              if (leadIdStr && !orgMemberIds.includes(leadIdStr)) {
                                orgMemberIds.unshift(leadIdStr);
                              }
                            }
                            setTeams([
                              ...teams,
                              {
                                id: ot._id,
                                name: ot.name,
                                key: ot.key || ot.name.slice(0, 3).toUpperCase(),
                                color: ot.color || '#3B82F6',
                                memberIds: orgMemberIds
                              }
                            ]);
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                          isIncluded
                            ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold shadow-2xs'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: ot.color || '#3B82F6' }}
                        />
                        <span>{ot.name}</span>
                        {isIncluded ? (
                          <Check className="w-3 h-3 text-blue-600 ml-0.5" />
                        ) : (
                          <Plus className="w-3 h-3 text-gray-400 ml-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Configured Teams List with Direct Member Assignment */}
            {teams.length > 0 ? (
              <div className="flex flex-col gap-3 mt-1 max-h-64 overflow-y-auto pr-1">
                {teams.map((t) => {
                  // Find matching organization team
                  const matchedOrgTeam = orgTeams.find(
                    (ot: any) => ot._id === t.id || ot.name.toLowerCase() === t.name.toLowerCase()
                  );

                  // Collect IDs of members assigned to this organization team
                  const orgMemberIdSet = new Set<string>();
                  if (matchedOrgTeam) {
                    if (matchedOrgTeam.leadId) {
                      const lId = (typeof matchedOrgTeam.leadId === 'object' && matchedOrgTeam.leadId?._id)
                        ? matchedOrgTeam.leadId._id.toString()
                        : matchedOrgTeam.leadId?.toString();
                      if (lId) orgMemberIdSet.add(lId);
                    }
                    if (Array.isArray(matchedOrgTeam.members)) {
                      matchedOrgTeam.members.forEach((m: any) => {
                        const mId = typeof m === 'object' ? (m._id || m.userId?._id || m.userId) : m;
                        if (mId) orgMemberIdSet.add(mId.toString());
                      });
                    }
                  }

                  const isShowAll = !!showAllMembersMap[t.id];

                  let candidateMembers: any[] = [];

                  if (isShowAll) {
                    candidateMembers = [...members];
                  } else if (matchedOrgTeam && orgMemberIdSet.size > 0) {
                    // Filter workspace members to ONLY those belonging to this team!
                    candidateMembers = members.filter((m: any) => {
                      const mId = ((typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id))?.toString();
                      return orgMemberIdSet.has(mId);
                    });

                    // Fallback if matchedOrgTeam.members has populated objects not in workspace members list
                    if (candidateMembers.length < orgMemberIdSet.size && Array.isArray(matchedOrgTeam.members)) {
                      const existingIds = new Set(
                        candidateMembers.map((m: any) =>
                          ((typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id))?.toString()
                        )
                      );
                      matchedOrgTeam.members.forEach((om: any) => {
                        if (typeof om === 'object' && om?._id) {
                          const omId = om._id.toString();
                          if (!existingIds.has(omId)) {
                            candidateMembers.push(om);
                            existingIds.add(omId);
                          }
                        }
                      });
                    }
                  } else if (matchedOrgTeam && matchedOrgTeam.department) {
                    // Department fallback (excluding Org Admins & PMs)
                    candidateMembers = members.filter((m: any) => {
                      const r = (m.role || m.userId?.role || '').toUpperCase();
                      if (r === 'ORG_ADMIN' || r === 'SUPER_ADMIN' || r === 'PROJECT_MANAGER') return false;
                      return m.department?.toLowerCase() === matchedOrgTeam.department?.toLowerCase();
                    });
                    if (candidateMembers.length === 0) {
                      candidateMembers = members.filter((m: any) => {
                        const r = (m.role || m.userId?.role || '').toUpperCase();
                        return r !== 'ORG_ADMIN' && r !== 'SUPER_ADMIN' && r !== 'PROJECT_MANAGER';
                      });
                    }
                  } else {
                    // Custom team: show non-admin, non-PM workspace members
                    candidateMembers = members.filter((m: any) => {
                      const r = (m.role || m.userId?.role || '').toUpperCase();
                      return r !== 'ORG_ADMIN' && r !== 'SUPER_ADMIN' && r !== 'PROJECT_MANAGER';
                    });
                  }

                  // Sort candidates: Team Lead first, then TEAM_LEAD role, then alphabetical
                  const leadIdStr = matchedOrgTeam?.leadId
                    ? ((typeof matchedOrgTeam.leadId === 'object' && matchedOrgTeam.leadId?._id) ? matchedOrgTeam.leadId._id.toString() : matchedOrgTeam.leadId.toString())
                    : '';

                  candidateMembers.sort((a: any, b: any) => {
                    const aId = ((typeof a.userId === 'object' && a.userId?._id) ? a.userId._id : (a.userId || a._id))?.toString();
                    const bId = ((typeof b.userId === 'object' && b.userId?._id) ? b.userId._id : (b.userId || b._id))?.toString();
                    if (leadIdStr && aId === leadIdStr) return -1;
                    if (leadIdStr && bId === leadIdStr) return 1;
                    const aRole = (a.role || a.userId?.role || '').toUpperCase();
                    const bRole = (b.role || b.userId?.role || '').toUpperCase();
                    if (aRole === 'TEAM_LEAD' && bRole !== 'TEAM_LEAD') return -1;
                    if (bRole === 'TEAM_LEAD' && aRole !== 'TEAM_LEAD') return 1;
                    return (a.name || '').localeCompare(b.name || '');
                  });

                  const candidateIds = candidateMembers.map((m: any) => {
                    const mId = (typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id);
                    return mId.toString();
                  });

                  const selectedCandidateCount = candidateMembers.filter((m: any) => {
                    const mId = ((typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id))?.toString();
                    return (t.memberIds || []).includes(mId);
                  }).length;

                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-white border border-gray-200 hover:border-gray-300 shadow-2xs text-xs flex flex-col gap-2 transition-all"
                    >
                      {/* Team Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            type="color"
                            value={t.color}
                            onChange={(e) => handleUpdateTeamColor(t.id, e.target.value)}
                            className="w-5 h-5 rounded-full cursor-pointer border-0 bg-transparent shrink-0"
                            title="Change team color"
                          />
                          <input
                            type="text"
                            value={t.name}
                            onChange={(e) => handleUpdateTeamName(t.id, e.target.value)}
                            className="flex-1 text-xs font-bold text-[#111827] bg-transparent outline-none border-b border-transparent focus:border-blue-500 px-0.5 py-0.5"
                            placeholder="Team name"
                          />
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase">
                            {t.key}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            {(t.memberIds || []).length} assigned
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTeam(t.id)}
                            className="p-1 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                            title="Remove team"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Member Selection Checkboxes for this Team */}
                      <div className="pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-3 h-3 text-[#0F172A]" />
                            <span>
                              {matchedOrgTeam ? `${t.name} Members` : 'Team Members'} ({selectedCandidateCount} of {candidateMembers.length} selected)
                            </span>
                          </span>
                          <div className="flex items-center gap-2 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleSelectAllMembers(t.id, candidateIds)}
                              className="text-blue-600 hover:underline font-semibold cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-gray-300">•</span>
                            <button
                              type="button"
                              onClick={() => handleClearMembers(t.id, candidateIds)}
                              className="text-gray-500 hover:text-rose-600 font-semibold cursor-pointer"
                            >
                              Clear
                            </button>
                            <span className="text-gray-300">•</span>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAllMembersMap((prev) => ({
                                  ...prev,
                                  [t.id]: !prev[t.id]
                                }));
                              }}
                              className="text-gray-500 hover:text-blue-600 font-medium cursor-pointer"
                            >
                              {isShowAll ? 'Show Team Only' : '+ All Members'}
                            </button>
                          </div>
                        </div>

                        {candidateMembers.length > 0 ? (
                          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-[#F9FAFB] rounded-lg border border-gray-100">
                            {candidateMembers.map((m: any) => {
                              const mId = (typeof m.userId === 'object' && m.userId?._id) ? m.userId._id : (m.userId || m._id);
                              const mName = m.name || (typeof m.userId === 'object' && m.userId?.name) || (m.email ? m.email.split('@')[0] : 'Member');
                              const mEmail = m.email || (typeof m.userId === 'object' && m.userId?.email) || '';
                              const mRole = m.role || (typeof m.userId === 'object' && m.userId?.role) || m.jobTitle || '';
                              const isChecked = (t.memberIds || []).includes(mId.toString());

                              return (
                                <label
                                  key={mId}
                                  className={`flex items-center gap-2 p-1.5 rounded-md border text-[11px] cursor-pointer transition-all select-none ${
                                    isChecked
                                      ? 'bg-blue-50/80 border-blue-200 text-blue-900 font-semibold shadow-2xs'
                                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleMember(t.id, mId.toString())}
                                    className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer shrink-0"
                                  />
                                  <div className="truncate flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="truncate leading-tight font-bold">{mName}</span>
                                      {mRole && (
                                        <span className={`text-[9px] font-medium shrink-0 ${
                                          mRole.toUpperCase() === 'TEAM_LEAD'
                                            ? 'text-purple-600 bg-purple-50 px-1 rounded'
                                            : 'text-gray-400'
                                        }`}>
                                          {mRole.replace(/_/g, ' ').toLowerCase()}
                                        </span>
                                      )}
                                    </div>
                                    {mEmail && <span className="block truncate text-[9px] text-gray-400 leading-tight">{mEmail}</span>}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200 text-center">
                            <p className="text-[11px] text-gray-500">No members configured in {t.name} yet.</p>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAllMembersMap((prev) => ({
                                  ...prev,
                                  [t.id]: true
                                }));
                              }}
                              className="mt-1 text-[11px] text-blue-600 font-semibold hover:underline cursor-pointer"
                            >
                              Assign from Workspace Members
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4 px-2 border border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-medium">
                No teams added yet. Click an organization team above to add.
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="border-t border-[#0F172A]/10 pt-4 flex items-center justify-end gap-2.5 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#111827]/70 hover:bg-[#F3F4F6] rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim() || !key.trim()}
              className="bg-[#0F172A] hover:bg-[#111827] text-white px-5 py-2 text-xs font-semibold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5"
            >
              {createMutation.isPending ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
