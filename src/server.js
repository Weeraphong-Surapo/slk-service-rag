const app = require('./app');
const config = require('./config');
const db = require('./config/database');
const qdrantService = require('./services/qdrant.service');
const retry = require('./utils/retry');

const start = async () => {
  await retry('MySQL', () => db.query('SELECT 1'));
  await retry('Qdrant', () => qdrantService.ensureCollection());

  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} (${config.env})`);
  });

  // Graceful shutdown
  const shutdown = () => {
    server.close(async () => {
      await db.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
