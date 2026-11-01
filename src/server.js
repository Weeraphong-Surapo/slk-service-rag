const app = require('./app');
const config = require('./config');
const db = require('./config/database');
const qdrantService = require('./services/qdrant.service');
const ollamaService = require('./services/ollama.service');
const retry = require('./utils/retry');

const start = async () => {
  await retry('MySQL', () => db.query('SELECT 1'));
  await retry('Qdrant', () => qdrantService.ensureCollection());

  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port} (${config.env})`);
  });
  // Multi-page bank statements can take several minutes (Node's default limit is 5 minutes)
  server.requestTimeout = 20 * 60 * 1000;

  // In the background: the API already accepts requests while models load
  if (config.ollama.warmUp) {
    ollamaService.warmUp().catch((err) => {
      console.log(`Warm-up failed: ${err.message}`);
    });
  }

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
