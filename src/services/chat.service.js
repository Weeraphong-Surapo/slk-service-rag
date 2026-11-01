const config = require('../config');
const AppError = require('../utils/AppError');
const ollamaService = require('./ollama.service');
const qdrantService = require('./qdrant.service');

const MAX_TOP_K = 20;

const NO_CONTEXT_ANSWER = 'ไม่พบข้อมูลที่เกี่ยวข้องในเอกสาร (No relevant information was found in the documents.)';

const SYSTEM_PROMPT = [
  'You are a helpful assistant that answers questions using only the provided context.',
  'Answer only what was asked, directly and briefly: at most 3 short sentences or 5 short bullet points.',
  'Do not repeat the question, do not add background, and do not list information that was not asked for.',
  'If the question needs a calculation, the length limit does not apply: show each step on its own line, then the result.',
  'Never take a number from a table row as the answer unless the value in the question matches that row exactly; calculate it.',
  'For progressive (stepped) rates, apply each rate only to the part of the amount inside that step, then add the steps.',
  'If the question has choices (ก. ข. ค. ง. or A B C D), calculate first, then name the choice that matches.',
  'Cite the sources you used with their numbers, for example [1] or [2].',
  'If the answer is not in the context, say that you do not know. Do not make up information.',
].join('\n');

// An English instruction made the model answer some Thai questions in English,
// so Thai questions get the whole instruction in Thai.
const SYSTEM_PROMPT_TH = [
  'คุณเป็นผู้ช่วยที่ตอบคำถามจากบริบทที่ให้มาเท่านั้น',
  'ตอบเป็นภาษาไทยเสมอ แม้บริบทบางส่วนจะเป็นภาษาอังกฤษ',
  'ตอบเฉพาะสิ่งที่ถาม ตรงและสั้น ไม่เกิน 3 ประโยคสั้น หรือ 5 ข้อสั้น',
  'ไม่ต้องทวนคำถาม ไม่ต้องเล่าพื้นหลัง และไม่ต้องใส่ข้อมูลที่ไม่ได้ถาม',
  'ถ้าคำถามต้องคำนวณ ไม่ต้องจำกัดความยาว ให้แสดงวิธีคิดทีละขั้น บรรทัดละขั้น แล้วจึงสรุปผล',
  'ห้ามหยิบตัวเลขจากแถวในตารางมาเป็นคำตอบ ถ้าค่าในคำถามไม่ตรงกับแถวนั้นพอดี ให้คำนวณเอง',
  'อัตราแบบขั้นบันได ให้คิดอัตราของแต่ละขั้นเฉพาะส่วนของจำนวนเงินที่อยู่ในขั้นนั้น แล้วนำทุกขั้นมารวมกัน',
  'ถ้าคำถามมีตัวเลือก (ก. ข. ค. ง. หรือ A B C D) ให้คำนวณก่อน แล้วระบุตัวเลือกที่ตรงกับผลลัพธ์',
  'อ้างอิงแหล่งที่ใช้ด้วยหมายเลข เช่น [1] หรือ [2]',
  'ถ้าบริบทไม่มีคำตอบ ให้ตอบว่าไม่พบข้อมูลในเอกสาร ห้ามแต่งข้อมูลขึ้นเอง',
].join('\n');

const THAI_CHARACTERS = /[\u0E00-\u0E7F]/;

const isThai = (question) => {
  return THAI_CHARACTERS.test(question);
};

const systemPromptFor = (question) => {
  if (isThai(question)) {
    return SYSTEM_PROMPT_TH;
  }
  return SYSTEM_PROMPT;
};

// A question that gives an amount and asks for a result. Without written steps the model
// copied a table value (65,000) or used only the last tax step; with steps it was correct.
const AMOUNT_IN_QUESTION = /\d{1,3}(,\d{3})+|\d{4,}/;
const ASKS_FOR_RESULT = /เท่าใด|เท่าไร|เท่าไหร่|กี่บาท|คำนวณ|ต้องชำระ|ต้องจ่าย|ต้องเสีย|how much|calculate|what is the (total|tax|amount)/i;

const needsCalculation = (question) => {
  return AMOUNT_IN_QUESTION.test(question) && ASKS_FOR_RESULT.test(question);
};

// Repeated at the end of the message, where the model follows it best
const answerRule = (question) => {
  const thai = isThai(question);
  if (needsCalculation(question)) {
    if (thai) {
      return [
        'คำถามนี้ต้องคำนวณ ตอบเป็นภาษาไทย ห้ามตอบตัวเลขทันที',
        'ขึ้นต้นคำตอบด้วย "วิธีคิด:" แล้วเขียนแต่ละขั้นเป็นบรรทัด พร้อมสูตรและตัวเลข',
        'ถ้าเป็นอัตราขั้นบันได ให้เขียนครบทุกขั้นตั้งแต่ขั้นแรกจนถึงจำนวนเงินในคำถาม แล้วรวม',
        'จบด้วยบรรทัด "คำตอบ: ..." (ถ้ามีตัวเลือก ให้ระบุตัวเลือกด้วย)',
      ].join('\n');
    }
    return [
      'This question needs a calculation. Do not give the number right away.',
      'Start with "Steps:" and write each step on its own line with the formula and numbers.',
      'For stepped rates, write every step from the first one up to the amount in the question, then add them.',
      'End with a line "Answer: ..." (include the choice if the question has choices).',
    ].join('\n');
  }
  if (thai) {
    return 'ตอบเป็นภาษาไทยเท่านั้น ตอบสั้น ตรงคำถาม';
  }
  return 'Answer in English only. Be brief and direct.';
};

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
    { role: 'system', content: systemPromptFor(question) },
    {
      role: 'user',
      content: `Context:\n${buildContext(points)}\n\nQuestion: ${question}\n\n${answerRule(question)}`,
    },
  ]);

  return { answer: answer.trim(), sources };
};
