const config = require('../config');
const AppError = require('../utils/AppError');

// Call the Ollama HTTP API and return the parsed JSON body
const request = async (path, body, timeoutMs = config.ollama.timeoutMs) => {
  let response;
  try {
    response = await fetch(`${config.ollama.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new AppError(`Cannot reach Ollama: ${err.message}`, 502);
  }

  if (!response.ok) {
    const detail = await response.text();
    const error = new AppError(`Ollama error (${response.status}): ${detail}`, 502);
    error.ollamaDetail = detail;
    throw error;
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

// Ollama returns this when it cannot build the JSON grammar for a model.
// Seen with Gemma 3 based models (e.g. Typhoon 2.1) on Ollama 0.40.
const isGrammarError = (err) => {
  return typeof err.ollamaDetail === 'string' && err.ollamaDetail.includes('Failed to initialize samplers');
};

// Ask the chat model for JSON. format is "json" or a JSON Schema object (Ollama structured outputs).
// Returns the raw reply text. If the model does not support structured outputs,
// retries without "format" and relies on the prompt, so the reply may wrap JSON in ```json fences.
// Models that failed with "format" once; skip "format" for them until the server restarts
const modelsWithoutFormat = new Set();

exports.chatJson = async (messages, format) => {
  const model = config.ollama.chatModel;
  const body = {
    model,
    messages,
    stream: false,
    options: { temperature: 0 },
  };

  if (!modelsWithoutFormat.has(model)) {
    try {
      const result = await request('/api/chat', { ...body, format });
      return result.message.content;
    } catch (err) {
      if (!isGrammarError(err)) {
        throw err;
      }
      console.log(`Model ${model} does not support structured outputs, using prompt-only JSON`);
      modelsWithoutFormat.add(model);
    }
  }

  const result = await request('/api/chat', body);
  return result.message.content;
};

// Send one image (base64) with the OCR prompt to the OCR model
exports.ocr = async (prompt, imageBase64) => {
  const result = await request(
    '/api/chat',
    {
      model: config.ollama.ocrModel,
      messages: [{ role: 'user', content: prompt, images: [imageBase64] }],
      stream: false,
      // Greedy decoding without repeat penalty. Typhoon's suggested settings
      // (temperature 0.1, repeat_penalty 1.1) invented table values in our tests,
      // likely because the penalty pushes the model away from repeating numbers like "65 บาท".
      options: { temperature: 0, repeat_penalty: 1.0 },
    },
    config.ollama.ocrTimeoutMs,
  );
  return result.message.content;
};
