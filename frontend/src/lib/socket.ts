import { io, Socket } from 'socket.io-client';

export const getSocketUrl = (): string => {
  if (typeof window !== 'undefined') {
    // When accessed through Cloudflare Tunnel, public HTTPS, or any reverse proxy:
    // Route through Next.js proxy rewrites on the same origin so WebSocket and polling work
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

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const isTunnel = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname.includes('trycloudflare.com'));
    socket = io(getSocketUrl(), {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: isTunnel ? ['polling'] : ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('⚡ Socket connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });
  }

  return socket;
};

export const joinProjectRoom = (projectId: string) => {
  const s = getSocket();
  if (s && projectId) {
    s.emit('join:project', projectId);
  }
};

export const leaveProjectRoom = (projectId: string) => {
  const s = getSocket();
  if (s && projectId) {
    s.emit('leave:project', projectId);
  }
};

export const joinTaskRoom = (taskId: string) => {
  const s = getSocket();
  if (s && taskId) {
    s.emit('join:task', taskId);
  }
};

export const leaveTaskRoom = (taskId: string) => {
  const s = getSocket();
  if (s && taskId) {
    s.emit('leave:task', taskId);
  }
};
