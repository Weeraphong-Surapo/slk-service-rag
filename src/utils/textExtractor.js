const path = require('path');
const mammoth = require('mammoth');
const { PDFParse, PasswordException, InvalidPDFException } = require('pdf-parse');
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

// Turn pdf.js errors into clear 400 responses
const toPdfError = (err, password) => {
  if (err instanceof PasswordException || err.name === 'PasswordException') {
    if (password === undefined || password === '') {
      return new AppError('The PDF is password protected. Send the password in the "password" field', 400);
    }
    return new AppError('The PDF password is incorrect', 400);
  }
  if (err instanceof InvalidPDFException || err.name === 'InvalidPDFException') {
    return new AppError('The file is not a valid PDF', 400);
  }
  return err;
};

// Read a PDF page by page. Uses the text layer where it is good and OCRs pages where it is
// missing or broken. Returns [{ num, text, ocr }].
const readPdfPages = async (buffer, { password, maxPages, label = 'PDF' } = {}) => {
  const options = { data: buffer };
  if (password !== undefined && password !== '') {
    options.password = password;
  }

  const parser = new PDFParse(options);
  try {
    let textResult;
    try {
      textResult = await parser.getText({ pageJoiner: '' });
    } catch (err) {
      throw toPdfError(err, password);
    }

    if (maxPages !== undefined && textResult.total > maxPages) {
      throw new AppError(`The PDF has ${textResult.total} pages, the maximum is ${maxPages}`, 400);
    }

    const pages = [];
    for (const page of textResult.pages) {
      if (pageNeedsOcr(page.text)) {
        console.log(`OCR ${label} page ${page.num}/${textResult.total}`);
        pages.push({ num: page.num, text: await ocrPdfPage(parser, page.num), ocr: true });
      } else {
        pages.push({ num: page.num, text: page.text, ocr: false });
      }
    }
    return pages;
  } finally {
    await parser.destroy();
  }
};

const extractPdf = async (buffer, fileName) => {
  const pages = await readPdfPages(buffer, { label: fileName });
  return pages
    .map((page) => {
      return page.text;
    })
    .join('\n\n');
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

module.exports = { extractText, readPdfPages, SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS };
