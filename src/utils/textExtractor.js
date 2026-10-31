const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const AppError = require('./AppError');

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

const extractPdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
};

const extractDocx = async (buffer) => {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
};

// Extract plain text from a file buffer based on its extension
const extractText = async (buffer, fileName) => {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.pdf') {
    return extractPdf(buffer);
  }
  if (extension === '.docx') {
    return extractDocx(buffer);
  }
  if (extension === '.txt' || extension === '.md') {
    return buffer.toString('utf8');
  }

  throw new AppError(`Unsupported file type: ${extension}`, 400);
};

module.exports = { extractText, SUPPORTED_EXTENSIONS };
