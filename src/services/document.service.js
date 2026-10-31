const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('../config/database');
const config = require('../config');
const AppError = require('../utils/AppError');
const { extractText } = require('../utils/textExtractor');
const { splitText } = require('../utils/chunker');
const { uploadDir } = require('../middlewares/upload.middleware');
const ollamaService = require('./ollama.service');
const qdrantService = require('./qdrant.service');

const LIST_COLUMNS = 'id, original_name, mime_type, size_bytes, status, chunk_count, error_message, created_at, updated_at';

const filePathOf = (document) => {
  return path.join(uploadDir, document.stored_name);
};

const markFailed = async (id, message) => {
  await db.execute(
    'UPDATE documents SET status = ?, error_message = ? WHERE id = ?',
    ['failed', message, id],
  );
};

// Extract -> chunk -> embed -> store vectors in Qdrant
const processDocument = async (document) => {
  const buffer = await fs.readFile(filePathOf(document));
  const text = await extractText(buffer, document.original_name);

  const chunks = splitText(text, config.rag.chunkSize, config.rag.chunkOverlap);
  if (chunks.length === 0) {
    throw new AppError('No text found in the file', 400);
  }

  const vectors = await ollamaService.embed(chunks);

  const points = chunks.map((chunk, index) => {
    return {
      id: crypto.randomUUID(),
      vector: vectors[index],
      payload: {
        document_id: document.id,
        chunk_index: index,
        file_name: document.original_name,
        text: chunk,
      },
    };
  });

  await qdrantService.upsert(points);

  await db.execute(
    'UPDATE documents SET content = ?, chunk_count = ?, status = ?, error_message = NULL WHERE id = ?',
    [text, chunks.length, 'ready', document.id],
  );
};

exports.getAll = async () => {
  const [rows] = await db.query(`SELECT ${LIST_COLUMNS} FROM documents ORDER BY id DESC`);
  return rows;
};

exports.getById = async (id) => {
  const [rows] = await db.execute('SELECT * FROM documents WHERE id = ?', [Number(id)]);
  if (rows.length === 0) {
    throw new AppError('Document not found', 404);
  }
  return rows[0];
};

// Save the upload record, then process it in the background.
// The client polls GET /documents/:id until status is "ready" or "failed".
exports.create = async (file) => {
  if (!file) {
    throw new AppError('file is required (multipart field "file")', 400);
  }

  let result;
  try {
    [result] = await db.execute(
      'INSERT INTO documents (original_name, stored_name, mime_type, size_bytes) VALUES (?, ?, ?, ?)',
      [file.originalname, file.filename, file.mimetype, file.size],
    );
  } catch (err) {
    // Do not leave an orphan file on disk when the record cannot be saved
    await fs.unlink(file.path).catch(() => {});
    throw err;
  }

  const document = await exports.getById(result.insertId);

  processDocument(document).catch(async (err) => {
    console.error(`Processing document ${document.id} failed:`, err.message);
    await markFailed(document.id, err.message).catch(console.error);
  });

  return document;
};

exports.remove = async (id) => {
  const document = await exports.getById(id);

  await qdrantService.deleteByDocumentId(document.id);
  await db.execute('DELETE FROM documents WHERE id = ?', [document.id]);

  try {
    await fs.unlink(filePathOf(document));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
};
