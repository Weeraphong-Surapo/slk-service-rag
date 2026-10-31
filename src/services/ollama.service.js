const config = require('../config');
const AppError = require('../utils/AppError');

// Call the Ollama HTTP API and return the parsed JSON body
const request = async (path, body) => {
  let response;
  try {
    response = await fetch(`${config.ollama.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.ollama.timeoutMs),
    });
  } catch (err) {
    throw new AppError(`Cannot reach Ollama: ${err.message}`, 502);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`Ollama error (${response.status}): ${detail}`, 502);
  }

  return response.json();
};

// Convert a list of texts into embedding vectors, in batches
exports.embed = async (texts) => {
  const vectors = [];
  const batchSize = config.rag.embedBatchSize;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await request('/api/embed', {
      model: config.ollama.embedModel,
      input: batch,
    });
    vectors.push(...result.embeddings);
  }

  return vectors;
};

// Send chat messages to the LLM and return the answer text
exports.chat = async (messages) => {
  const result = await request('/api/chat', {
    model: config.ollama.chatModel,
    messages,
    stream: false,
    options: { temperature: 0.2 },
  });
  return result.message.content;
};
