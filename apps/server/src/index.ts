import { app } from './app.js';
import { config } from './config.js';

const server = app.listen(config.PORT, () => {
  console.log(`Countwise API server running on port ${config.PORT} in ${config.NODE_ENV} mode`);
  console.log(`Health check: http://localhost:${config.PORT}/health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
  });
});
