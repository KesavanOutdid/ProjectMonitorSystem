const path = require('path');
const nodeEnv = process.env.NODE_ENV || 'development';
require('dotenv').config({ path: path.resolve(__dirname, `../.env.${nodeEnv}`) });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initRedis } = require('./config/redis');
const { initSocket } = require('./config/socket');
const { initRecycleBinWorker } = require('./workers/recycleBinPurgeWorker');

const PORT = process.env.PORT || 5000;

const os = require('os');

const getLocalIp = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
};

const startServer = async () => {
  // 1. Connect Database
  await connectDB();

  // 2. Initialize Redis Client
  initRedis();

  // 3. Initialize Automated Recycle Bin 30-Day Purge Worker
  initRecycleBinWorker();

  // 4. Create HTTP Server & Bind Socket.io
  const server = http.createServer(app);
  initSocket(server);

  // 4. Start Express HTTP Server (listens on all network interfaces & localhost)
  const localIp = getLocalIp();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`
=====================================================
🚀 Project Monitor System API Running
📡 Local:       http://localhost:${PORT}
🌐 Network IP:  http://${localIp}:${PORT}
📚 Swagger UI:  http://${localIp}:${PORT}/api/docs
⚡ Mode:        ${process.env.NODE_ENV || 'development'}
=====================================================
    `);
  });

  // Handle Unhandled Promise Rejections
  process.on('unhandledRejection', (err) => {
    console.error(`[Unhandled Rejection] ${err.message}`);
    // Keep server alive in dev or gracefully shutdown in prod
  });

  // Handle SIGTERM
  process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('[Server] Process terminated.');
    });
  });
};

startServer();
