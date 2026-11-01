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
    // Typhoon OCR: reads Thai/English text from images and scanned PDF pages
    ocrModel: process.env.OLLAMA_OCR_MODEL || 'scb10x/typhoon-ocr1.5-3b',
    ocrTimeoutMs: toNumber(process.env.OLLAMA_OCR_TIMEOUT_MS, 300000),
    // Context window for OCR. The image alone uses thousands of tokens, so Ollama's
    // small default cut the text off in the middle of a table.
    // 8192 fits a full statement page; 16384 made the chat and OCR models too big to stay in 16 GB VRAM together
    ocrContextLength: toNumber(process.env.OLLAMA_OCR_NUM_CTX, 8192),
    // Context window for JSON extraction. A statement page plus its JSON reply
    // does not fit in Ollama's small default context.
    jsonContextLength: toNumber(process.env.OLLAMA_JSON_NUM_CTX, 8192),
    // auto = try Ollama structured outputs first; off = prompt-only JSON (skip the try).
    // Typhoon 2.1 (Gemma 3) does not support structured outputs, so "off" saves a failed request.
    jsonFormat: process.env.OLLAMA_JSON_FORMAT || 'auto',
    // Load the chat and embedding models when the API starts, so the first user does not wait
    warmUp: process.env.OLLAMA_WARMUP !== 'false',
    // Also load the OCR model. Off by default: with the 12B chat model it does not fit in 16 GB
    // together, so it would push the chat model out again.
    warmUpOcr: process.env.OLLAMA_WARMUP_OCR === 'true',
  },

  statement: {
    // Larger statements take several minutes; reject them instead of timing out
    maxPages: toNumber(process.env.STATEMENT_MAX_PAGES, 30),
  },

  ocr: {
    // auto   = OCR only PDF pages with no text or broken Thai text
    // always = OCR every PDF page (slow, best for Thai PDFs)
    // never  = use the PDF text layer only
    pdfMode: process.env.PDF_OCR_MODE || 'auto',
    // A page with fewer non-space characters than this is treated as scanned
    minPageChars: toNumber(process.env.OCR_MIN_PAGE_CHARS, 30),
    // A page with at least this many broken Thai patterns is OCRed in auto mode
    brokenThaiThreshold: toNumber(process.env.OCR_BROKEN_THAI_THRESHOLD, 3),
    // Longest image side sent to the OCR model
    maxImageDimension: toNumber(process.env.OCR_MAX_IMAGE_DIMENSION, 1800),
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
