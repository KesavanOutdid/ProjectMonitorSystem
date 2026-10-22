// Cross-tab synchronization service using Web BroadcastChannel + Storage events
// Ensures that deletions, restorations, and workspace updates in one tab reflect instantly across other tabs.

export type SyncEventType =
  | 'TASK_DELETED'
  | 'TASK_RESTORED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'PROJECT_DELETED'
  | 'PROJECT_RESTORED'
  | 'PROJECT_CREATED'
  | 'RECYCLE_BIN_CHANGED'
  | 'WORKSPACE_SYNC';

export interface SyncMessage {
  type: SyncEventType;
  payload?: any;
  timestamp: number;
  originTabId: string;
}

const TAB_ID = Math.random().toString(36).substring(2, 9);
const CHANNEL_NAME = 'outdid_cross_tab_sync';
const STORAGE_KEY = 'outdid_sync_event';

let channel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch (e) {
    console.warn('BroadcastChannel not available, falling back to storage events', e);
  }
}

/**
 * Broadcast an event to all other open tabs in the same browser, and dispatch locally.
 */
export const broadcastSyncEvent = (type: SyncEventType, payload?: any) => {
  const msg: SyncMessage = {
    type,
    payload,
    timestamp: Date.now(),
    originTabId: TAB_ID
  };

  // 1. Send via BroadcastChannel (instant for other tabs)
  if (channel) {
    try {
      channel.postMessage(msg);
    } catch (e) {
      console.warn('Failed to postMessage on BroadcastChannel', e);
    }
  }

  // 2. Storage event fallback (always triggers 'storage' in all other tabs)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msg));
    } catch (_) {}
  }

  // 3. Local tab custom event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('outdid-local-sync', { detail: msg }));
  }
};

/**
 * Subscribe to cross-tab events from other tabs and local events.
 */
export const subscribeCrossTabSync = (callback: (msg: SyncMessage) => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleChannelMessage = (event: MessageEvent) => {
    if (event.data && event.data.type) {
      callback(event.data);
    }
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const msg = JSON.parse(event.newValue);
        if (msg.originTabId !== TAB_ID) {
          callback(msg);
        }
      } catch (_) {}
    }
  };

  const handleLocal = (event: any) => {
    if (event.detail) {
      callback(event.detail);
    }
  };

  if (channel) {
    channel.addEventListener('message', handleChannelMessage);
  }
  window.addEventListener('storage', handleStorage);
  window.addEventListener('outdid-local-sync', handleLocal);

  return () => {
    if (channel) {
      channel.removeEventListener('message', handleChannelMessage);
    }
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('outdid-local-sync', handleLocal);
  };
};
