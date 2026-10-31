const config = require('../config');
const AppError = require('../utils/AppError');
const ollamaService = require('./ollama.service');
const qdrantService = require('./qdrant.service');

const MAX_TOP_K = 20;

const NO_CONTEXT_ANSWER = 'ไม่พบข้อมูลที่เกี่ยวข้องในเอกสาร (No relevant information was found in the documents.)';

const SYSTEM_PROMPT = [
  'You are a helpful assistant that answers questions using only the provided context.',
  'Answer in the same language as the question (Thai or English).',
  'Cite the sources you used with their numbers, for example [1] or [2].',
  'If the answer is not in the context, say that you do not know. Do not make up information.',
].join('\n');

const buildContext = (points) => {
  return points
    .map((point, index) => {
      return `[${index + 1}] (${point.payload.file_name})\n${point.payload.text}`;
    })
    .join('\n\n');
};

const resolveTopK = (topK) => {
  if (topK === undefined) {
    return config.rag.topK;
  }

  const value = Number(topK);
  if (!Number.isInteger(value) || value < 1 || value > MAX_TOP_K) {
    throw new AppError(`topK must be an integer between 1 and ${MAX_TOP_K}`, 400);
  }
  return value;
};

exports.ask = async ({ question, topK } = {}) => {
  if (typeof question !== 'string' || question.trim() === '') {
    throw new AppError('question is required', 400);
  }

  const limit = resolveTopK(topK);
  const [questionVector] = await ollamaService.embed([question]);
  const points = await qdrantService.search(questionVector, limit);

  const sources = points.map((point, index) => {
    return {
      ref: index + 1,
      documentId: point.payload.document_id,
      fileName: point.payload.file_name,
      chunkIndex: point.payload.chunk_index,
      score: point.score,
      text: point.payload.text,
    };
  });

  if (points.length === 0) {
    return { answer: NO_CONTEXT_ANSWER, sources };
  }

  const answer = await ollamaService.chat([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Context:\n${buildContext(points)}\n\nQuestion: ${question}`,
    },
  ]);

  return { answer, sources };
};
