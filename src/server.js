const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} (${config.env})`);
});

// Graceful shutdown
const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
