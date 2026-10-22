import { create } from 'zustand';
import api, { getStoredAccessToken, clearStoredTokens } from '../lib/api';

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role:
    | 'SUPER_ADMIN'
    | 'ORG_ADMIN'
    | 'PROJECT_MANAGER'
    | 'TEAM_LEAD'
    | 'DEVELOPER'
    | 'QA'
    | 'CLOUD'
    | 'DESIGNER'
    | 'MEMBER'
    | 'GUEST'
    | string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  avatar?: string;
  jobTitle?: string;
  department?: string;
  currentWorkspace?: string;
  unreadProjectAssignments?: Array<{
    projectId: string;
    projectName: string;
    projectKey: string;
    assignedBy?: string;
    assignedAt?: string;
  }>;
}

export interface Workspace {
  _id: string;
  name: string;
  slug: string;
  ownerId: any;
  subscriptionId?: any;
}

export interface Project {
  _id: string;
  name: string;
  key: string;
  description?: string;
  category?: string;
  color?: string;
  workspaceId?: string;
  leadId?: any;
  members?: any[];
}

interface AuthState {
  user: User | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  projects: Project[];
  currentProject: Project | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setCurrentProject: (project: Project | null) => void;
  fetchUser: () => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  fetchProjects: (workspaceId: string) => Promise<void>;
  logout: (allTabs?: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  workspaces: [],
  currentWorkspace: null,
  projects: [],
  currentProject: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setCurrentProject: (project) => {
    if (project?._id && typeof window !== 'undefined') {
      sessionStorage.setItem('selected_project_id', project._id);
      localStorage.setItem('selected_project_id', project._id);
      const url = new URL(window.location.href);
      if (url.searchParams.get('project') !== project._id) {
        url.searchParams.set('project', project._id);
        window.history.replaceState(null, '', url.toString());
      }
    }
    set({ currentProject: project });
  },

  fetchUser: async () => {
    const token = getStoredAccessToken();
    if (!token) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const res = await api.get('/auth/me');
      if (res.data.success) {
        set({ user: res.data.data, isAuthenticated: true });
        if (res.data.data.currentWorkspace) {
          set({ currentWorkspace: res.data.data.currentWorkspace });
        }
      }
    } catch (err) {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchWorkspaces: async () => {
    try {
      const res = await api.get('/workspaces');
      if (res.data.success) {
        set({ workspaces: res.data.data });
        if (!get().currentWorkspace && res.data.data.length > 0) {
          set({ currentWorkspace: res.data.data[0] });
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  },

  fetchProjects: async (workspaceId: string) => {
    try {
      const res = await api.get(`/projects?workspaceId=${workspaceId}`);
      if (res.data.success) {
        const projectList = res.data.data || [];
        set({ projects: projectList });
        
        let targetId: string | null = null;
        if (typeof window !== 'undefined') {
          const urlParam = new URLSearchParams(window.location.search).get('project');
          targetId = urlParam || sessionStorage.getItem('selected_project_id') || localStorage.getItem('selected_project_id');
        }
        if (!targetId && get().currentProject?._id) {
          targetId = get().currentProject?._id || null;
        }
        
        if (targetId) {
          const matched = projectList.find((p: any) => p._id === targetId);
          if (matched) {
            set({ currentProject: matched });
            return;
          }
        }
        
        if (projectList.length > 0) {
          set({ currentProject: projectList[0] });
        } else {
          set({ currentProject: null });
        }
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  },

  logout: (allTabs = false) => {
    clearStoredTokens(allTabs);
    set({
      user: null,
      isAuthenticated: false,
      currentWorkspace: null,
      currentProject: null,
      projects: [],
      workspaces: []
    });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }
}));
