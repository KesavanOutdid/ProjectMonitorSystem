const { Server } = require('socket.io');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true
    },
    pingTimeout: 60000
  });

  io.on('connection', (socket) => {
    console.log(`⚡ [Socket.io] Client connected: ${socket.id}`);

    // Join project room for live board sync
    socket.on('join:project', (projectId) => {
      if (projectId) {
        socket.join(`project:${projectId}`);
        console.log(`📡 [Socket.io] ${socket.id} joined project room: project:${projectId}`);
      }
    });

    socket.on('leave:project', (projectId) => {
      if (projectId) {
        socket.leave(`project:${projectId}`);
        console.log(`🔌 [Socket.io] ${socket.id} left project room: project:${projectId}`);
      }
    });

    // Join task room for active modal sync
    socket.on('join:task', (taskId) => {
      if (taskId) {
        socket.join(`task:${taskId}`);
        console.log(`📝 [Socket.io] ${socket.id} joined task room: task:${taskId}`);
      }
    });

    socket.on('leave:task', (taskId) => {
      if (taskId) {
        socket.leave(`task:${taskId}`);
        console.log(`🔌 [Socket.io] ${socket.id} left task room: task:${taskId}`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [Socket.io] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  console.log('[Socket.io] Real-time collaboration engine initialized');
  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized!');
  }
  return io;
};

const emitToProject = (projectId, event, data) => {
  if (io && projectId) {
    io.to(`project:${projectId}`).emit(event, data);
    console.log(`📢 [Socket.io] Broadcast to project:${projectId} -> event: '${event}'`);
  }
};

const emitToTask = (taskId, event, data) => {
  if (io && taskId) {
    io.to(`task:${taskId}`).emit(event, data);
    console.log(`📢 [Socket.io] Broadcast to task:${taskId} -> event: '${event}'`);
  }
};

const emitGlobal = (event, data) => {
  if (io) {
    io.emit(event, data);
    console.log(`📢 [Socket.io] Global broadcast -> event: '${event}'`);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToProject,
  emitToTask,
  emitGlobal
};
