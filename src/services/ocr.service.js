const config = require('../config');
const AppError = require('../utils/AppError');
const { toOcrPng } = require('../utils/image');
const { toJsonSchema, compileSchema, validate: validateJson } = require('../utils/jsonSchema');
const ollamaService = require('./ollama.service');

const MAX_PROMPT_LENGTH = 4000;
const MAX_SCHEMA_LENGTH = 10000;
// First try + one fix request
const MAX_JSON_ATTEMPTS = 2;

// Typhoon OCR only works with its own prompt (see the model card on ollama.com)
const OCR_PROMPT = `Extract all text from the image.

Instructions:
- Only return the clean Markdown.
- Do not include any explanation or extra text.
- You must include all information on the page.

Formatting Rules:
- Tables: Render tables using <table>...</table> in clean HTML format.
- Equations: Render equations using LaTeX syntax with inline ($...$) and block ($$...$$).
- Images/Charts/Diagrams: Wrap any clearly defined visual areas (e.g. charts, diagrams, pictures) in:

<figure>
Describe the image's main elements (people, objects, text), note any contextual clues (place, event, culture), mention visible text and its meaning, provide deeper analysis when relevant (especially for financial charts, graphs, or documents), comment on style or architecture if relevant, then give a concise overall summary. Describe in Thai.
</figure>

- Page Numbers: Wrap page numbers in <page_number>...</page_number> (e.g., <page_number>14</page_number>).
- Checkboxes: Use ☐ for unchecked and ☑ for checked boxes.`;

const ANSWER_SYSTEM_PROMPT = [
  'You answer the user request using the text that was extracted from an image by OCR.',
  'Answer in the same language as the request (Thai or English).',
  'If the information is not in the text, say that it is not in the image. Do not make up information.',
].join('\n');

// Older Typhoon OCR versions return {"natural_text": "..."}; newer ones return Markdown
const cleanOcrOutput = (output) => {
  const trimmed = output.trim();
  if (!trimmed.startsWith('{')) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.natural_text === 'string') {
      return parsed.natural_text.trim();
    }
  } catch (err) {
    // Not JSON, keep the text as it is
  }
  return trimmed;
};

// Read the text in an image buffer (PNG, JPEG, WebP) and return it as Markdown
exports.ocrImage = async (buffer) => {
  const png = await toOcrPng(buffer, config.ocr.maxImageDimension);
  const output = await ollamaService.ocr(OCR_PROMPT, png.toString('base64'));
  return cleanOcrOutput(output);
};

// text   = OCR only (fastest, no chat model)
// answer = OCR + prompt -> text answer
// json   = OCR + prompt -> JSON object (optionally shaped by a JSON Schema)
const FORMATS = ['text', 'answer', 'json'];

const DEFAULT_JSON_PROMPT = 'Extract all important information from the text as JSON.';

const JSON_SYSTEM_PROMPT = [
  'You extract information from text that was read from an image by OCR.',
  'Reply with JSON only. Use only information found in the text.',
  'Copy every number exactly as it is written in the text.',
  'Do not calculate, multiply, add or convert numbers unless the request asks for it.',
  'Each value must come from one place in the text. Do not combine values from different lines.',
  'Use null for values that are not in the text. Keep the original language of the values.',
].join('\n');

const toTrimmedString = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
};

// Without a format: "answer" when a prompt is sent, otherwise "text"
const resolveFormat = (format, prompt) => {
  const value = toTrimmedString(format);
  if (value === '') {
    if (prompt === '') {
      return 'text';
    }
    return 'answer';
  }
  if (!FORMATS.includes(value)) {
    throw new AppError(`format must be one of: ${FORMATS.join(', ')}`, 400);
  }
  return value;
};

// schema is sent as a string in the multipart form: a simple template or a full JSON Schema
const parseSchema = (schema) => {
  const value = toTrimmedString(schema);
  if (value === '') {
    return null;
  }
  if (value.length > MAX_SCHEMA_LENGTH) {
    throw new AppError(`schema must be at most ${MAX_SCHEMA_LENGTH} characters`, 400);
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (err) {
    // err.message includes the position, e.g. "... at position 210 (line 1 column 211)"
    throw new AppError(`schema is not valid JSON: ${err.message}`, 400);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('schema must be a JSON object, e.g. {"total":"number"}', 400);
  }
  // Returns { schema, validator }; fields inside the schema also accept null
  return compileSchema(toJsonSchema(parsed));
};

// Read JSON from the model reply. Handles plain JSON, ```json fences and text around the object.
// Returns { value } or { error } so the caller can ask the model to fix it.
const parseJsonReply = (output) => {
  let candidate = output.trim();

  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    candidate = fenced[1].trim();
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    candidate = candidate.slice(start, end + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return { error: 'The reply was not valid JSON' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'The reply was not a JSON object' };
  }
  return { value: parsed };
};

const missingRequiredKeys = (value, schema) => {
  if (!Array.isArray(schema.required)) {
    return [];
  }
  return schema.required.filter((key) => {
    return !(key in value);
  });
};

// Parse and check one model reply. Returns { value } or { error }.
// A missing top-level field usually means the model renamed it (e.g. store_name),
// so ask for a fix first. Only on the last attempt fill it with null.
// prepare(value) can clean the value before validation, e.g. turn "1,250.00" into 1250.
const checkReply = (output, compiled, isLastAttempt, prepare) => {
  const parsed = parseJsonReply(output);
  if (parsed.error !== undefined || compiled === null) {
    return parsed;
  }
  if (prepare !== undefined) {
    prepare(parsed.value);
  }

  const missing = missingRequiredKeys(parsed.value, compiled.schema);
  if (missing.length > 0) {
    if (!isLastAttempt) {
      return { error: `Missing fields: ${missing.join(', ')}. Use exactly the field names from the schema` };
    }
    for (const key of missing) {
      parsed.value[key] = null;
    }
  }

  // validate() also removes fields that are not in the schema
  const errors = validateJson(compiled.validator, parsed.value);
  if (errors !== null) {
    return { error: `The JSON does not match the schema: ${errors}` };
  }
  return parsed;
};

// Ask the model for JSON. When the reply is not valid, send the errors back once and ask for a fix.
// options.sourceLabel describes where the text came from; options.prepare cleans values before validation.
const extractJson = async (text, prompt, compiled, options = {}) => {
  let request = prompt;
  if (request === '') {
    request = DEFAULT_JSON_PROMPT;
  }
  let sourceLabel = 'Text from the image';
  if (options.sourceLabel !== undefined) {
    sourceLabel = options.sourceLabel;
  }

  let userContent = `${sourceLabel}:\n${text}\n\nRequest: ${request}`;
  // Ollama recommends also putting the schema in the prompt
  let format = 'json';
  if (compiled !== null) {
    userContent += `\n\nReturn JSON that matches this JSON Schema:\n${JSON.stringify(compiled.schema)}`;
    format = compiled.schema;
  }

  const messages = [
    { role: 'system', content: JSON_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_JSON_ATTEMPTS; attempt += 1) {
    const output = await ollamaService.chatJson(messages, format);
    const checked = checkReply(output, compiled, attempt === MAX_JSON_ATTEMPTS, options.prepare);
    if (checked.error === undefined) {
      return checked.value;
    }

    lastError = checked.error;
    messages.push({ role: 'assistant', content: output });
    messages.push({
      role: 'user',
      content: `${checked.error}. Fix it and reply with the corrected JSON only.`,
    });
  }

  throw new AppError(`The model could not produce valid JSON: ${lastError}`, 502);
};

// Shared with other document types (e.g. bank statements)
exports.extractJson = extractJson;

// OCR an uploaded image, then build only the output that was asked for
exports.ask = async ({ file, prompt, format, schema }) => {
  if (!file) {
    throw new AppError('image is required (multipart field "image")', 400);
  }

  const request = toTrimmedString(prompt);
  if (request.length > MAX_PROMPT_LENGTH) {
    throw new AppError(`prompt must be at most ${MAX_PROMPT_LENGTH} characters`, 400);
  }

  // Validate everything before the slow OCR step
  const outputFormat = resolveFormat(format, request);
  if (outputFormat === 'answer' && request === '') {
    throw new AppError('prompt is required when format is "answer"', 400);
  }
  let jsonSchema = null;
  if (outputFormat === 'json') {
    jsonSchema = parseSchema(schema);
  }

  const text = await exports.ocrImage(file.buffer);
  const result = { format: outputFormat, text, answer: null, json: null };

  if (outputFormat === 'answer') {
    const answer = await ollamaService.chat([
      { role: 'system', content: ANSWER_SYSTEM_PROMPT },
      { role: 'user', content: `Text from the image:\n${text}\n\nRequest: ${request}` },
    ]);
    result.answer = answer.trim();
  }

  if (outputFormat === 'json') {
    result.json = await extractJson(text, request, jsonSchema);
  }

  return result;
};
