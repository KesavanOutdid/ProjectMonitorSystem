import api from './api';

export interface ExportProjectExcelOptions {
  projectId: string;
  projectKey?: string;
  scope?: 'all' | 'filtered';
  sprintName?: string;
  team?: string;
  startTaskNumber?: number | string;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

/**
 * Downloads all project tasks, subtasks & microtasks formatted with Task IDs (Keys),
 * interactive in-cell dropdowns, starting serial number, and hierarchical parent-child alignment for Excel.
 */
export const downloadProjectExcel = async ({
  projectId,
  projectKey = 'project',
  scope = 'all',
  sprintName,
  team,
  startTaskNumber,
  onSuccess,
  onError
}: ExportProjectExcelOptions): Promise<boolean> => {
  try {
    const params = new URLSearchParams();
    if (scope) params.append('scope', scope);
    if (startTaskNumber) params.append('startTaskNumber', String(startTaskNumber));
    if (scope !== 'all') {
      if (sprintName && sprintName !== 'ALL') params.append('sprintName', sprintName);
      if (team && team !== 'ALL') params.append('team', team);
    }

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await api.get(`/projects/${projectId}/export-excel${queryString}`, {
      responseType: 'blob'
    });

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const today = new Date().toISOString().split('T')[0];
    const safeKey = (projectKey || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    link.setAttribute('download', `${safeKey}_tasks_export_${today}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);

    onSuccess?.();
    return true;
  } catch (err: any) {
    console.error('Failed to export project tasks to Excel:', err);
    onError?.(err);
    throw err;
  }
};
