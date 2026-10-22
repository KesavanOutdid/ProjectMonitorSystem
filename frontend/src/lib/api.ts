import axios from 'axios';

export const getBackendUrl = (): string => {
  if (typeof window !== 'undefined') {
    // When accessed through Cloudflare Tunnel, public HTTPS, or any reverse proxy:
    // Route through Next.js proxy rewrites so a single public URL serves both frontend and backend
    if (window.location.protocol === 'https:' || !window.location.port || window.location.port === '80' || window.location.port === '443') {
      return window.location.origin;
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:5000`;
  }
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '');
  }
  return 'http://127.0.0.1:5000';
};

export const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    // When accessed through Cloudflare Tunnel, public HTTPS, or any reverse proxy:
    if (window.location.protocol === 'https:' || !window.location.port || window.location.port === '80' || window.location.port === '443') {
      return `${window.location.origin}/api/v1`;
    }
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:5000/api/v1`;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  return 'http://127.0.0.1:5000/api/v1';
};

// Multi-Tab Session Isolation configuration (defaults to true so different tabs can log in as different users)
export const isMultiTabIsolationEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem('multitab_isolation_enabled');
  return val === null ? true : val === 'true';
};

export const setMultiTabIsolation = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem('multitab_isolation_enabled', enabled ? 'true' : 'false');
};

export const getStoredAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  // 1. Check tab-isolated sessionStorage first
  const sessionToken = sessionStorage.getItem('access_token');
  if (sessionToken) return sessionToken;

  // 2. If multi-tab isolation is off, or if no tab session exists yet and not in tab-isolation mode:
  if (!isMultiTabIsolationEnabled()) {
    return localStorage.getItem('access_token');
  }

  return null;
};

export const getStoredRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const sessionToken = sessionStorage.getItem('refresh_token');
  if (sessionToken) return sessionToken;

  if (!isMultiTabIsolationEnabled()) {
    return localStorage.getItem('refresh_token');
  }

  return null;
};

export const setStoredTokens = (accessToken: string, refreshToken?: string, tabOnly = false) => {
  if (typeof window === 'undefined') return;
  // Always store in sessionStorage so each tab has its own independent login
  sessionStorage.setItem('access_token', accessToken);
  if (refreshToken) {
    sessionStorage.setItem('refresh_token', refreshToken);
  }

  // Also update localStorage as persistent fallback (unless tabOnly is specified)
  if (!tabOnly || !localStorage.getItem('access_token')) {
    localStorage.setItem('access_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
  }
};

export const clearStoredTokens = (clearAllTabs = false) => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('active_tab');
  sessionStorage.removeItem('selected_project_id');

  if (clearAllTabs) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('active_tab');
    localStorage.removeItem('selected_project_id');
  }
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true
});

// Interceptor to inject JWT Access Token and ensure correct baseURL for network devices
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.baseURL = getApiBaseUrl();
    const token = getStoredAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Interceptor to handle Token Refresh & Expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = getStoredRefreshToken();
        if (refreshToken) {
          const baseUrl = getApiBaseUrl();
          const res = await axios.post(`${baseUrl}/auth/refresh-token`, { refreshToken });
          const newAccessToken = res.data.data.tokens.accessToken;
          const newRefreshToken = res.data.data.tokens.refreshToken;

          setStoredTokens(newAccessToken, newRefreshToken);

          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        if (typeof window !== 'undefined') {
          clearStoredTokens(false);
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

export default api;
