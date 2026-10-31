const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const config = require('../config');
const AppError = require('./AppError');
const ocrService = require('../services/ocr.service');

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', ...IMAGE_EXTENSIONS];

// A Thai word never starts with these characters (vowels and tone marks that follow a consonant).
// "ไม เกิน" or "ล านบาท" style breaks mean the PDF font mapping is broken.
const BROKEN_THAI = /[ \t][\u0E30-\u0E3A\u0E45\u0E47-\u0E4E]/g;

const countBrokenThai = (text) => {
  const matches = text.match(BROKEN_THAI);
  if (matches === null) {
    return 0;
  }
  return matches.length;
};

const pageNeedsOcr = (text) => {
  if (config.ocr.pdfMode === 'always') {
    return true;
  }
  if (config.ocr.pdfMode === 'never') {
    return false;
  }

  const visibleChars = text.replace(/\s/g, '').length;
  if (visibleChars < config.ocr.minPageChars) {
    return true;
  }
  return countBrokenThai(text) >= config.ocr.brokenThaiThreshold;
};

const ocrPdfPage = async (parser, pageNumber) => {
  const result = await parser.getScreenshot({
    partial: [pageNumber],
    desiredWidth: config.ocr.maxImageDimension,
    imageBuffer: true,
    imageDataUrl: false,
  });
  return ocrService.ocrImage(Buffer.from(result.pages[0].data));
};

// Use the PDF text layer where it is good, and OCR the pages where it is missing or broken
const extractPdf = async (buffer, fileName) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText({ pageJoiner: '' });
    const pages = [];

    for (const page of textResult.pages) {
      if (pageNeedsOcr(page.text)) {
        console.log(`OCR ${fileName} page ${page.num}/${textResult.total}`);
        pages.push(await ocrPdfPage(parser, page.num));
      } else {
        pages.push(page.text);
      }
    }

    return pages.join('\n\n');
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
    return extractPdf(buffer, fileName);
  }
  if (extension === '.docx') {
    return extractDocx(buffer);
  }
  if (extension === '.txt' || extension === '.md') {
    return buffer.toString('utf8');
  }
  if (IMAGE_EXTENSIONS.includes(extension)) {
    return ocrService.ocrImage(buffer);
  }

  throw new AppError(`Unsupported file type: ${extension}`, 400);
};

module.exports = { extractText, SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS };
