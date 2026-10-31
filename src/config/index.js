require('dotenv').config();

// Read a number from env, fall back to the default when missing or invalid
const toNumber = (value, fallback) => {
  const number = Number(value);
  if (value === undefined || value === '' || Number.isNaN(number)) {
    return fallback;
  }
  return number;
};

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 3000),
  // Swagger is off unless SWAGGER_ENABLED=true
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: toNumber(process.env.MYSQL_PORT, 3306),
    database: process.env.MYSQL_DATABASE || 'rag',
    user: process.env.MYSQL_USER || 'rag',
    password: process.env.MYSQL_PASSWORD || '',
  },

  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
    collection: process.env.QDRANT_COLLECTION || 'documents',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    chatModel: process.env.OLLAMA_CHAT_MODEL || 'scb10x/typhoon2.1-gemma3-4b',
    embedModel: process.env.OLLAMA_EMBED_MODEL || 'bge-m3',
    // bge-m3 produces 1024-dimension vectors
    embedDimension: toNumber(process.env.OLLAMA_EMBED_DIMENSION, 1024),
    timeoutMs: toNumber(process.env.OLLAMA_TIMEOUT_MS, 120000),
  },

  rag: {
    chunkSize: toNumber(process.env.RAG_CHUNK_SIZE, 1000),
    chunkOverlap: toNumber(process.env.RAG_CHUNK_OVERLAP, 200),
    topK: toNumber(process.env.RAG_TOP_K, 5),
    embedBatchSize: toNumber(process.env.RAG_EMBED_BATCH_SIZE, 16),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSizeMb: toNumber(process.env.UPLOAD_MAX_FILE_SIZE_MB, 20),
  },
};
