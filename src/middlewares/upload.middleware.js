const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const AppError = require('../utils/AppError');
const { SUPPORTED_EXTENSIONS, IMAGE_EXTENSIONS } = require('../utils/textExtractor');

const uploadDir = path.resolve(config.upload.dir);
fs.mkdirSync(uploadDir, { recursive: true });

const limits = { fileSize: config.upload.maxFileSizeMb * 1024 * 1024 };

// Only accept files whose extension is in the allowed list
const allowExtensions = (allowed) => {
  return (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(extension)) {
      cb(new AppError(`Unsupported file type. Allowed: ${allowed.join(', ')}`, 400));
      return;
    }
    cb(null, true);
  };
};

// Run a multer middleware and turn multer errors into 400 responses
const withErrorHandling = (middleware) => {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        next(new AppError(err.message, 400));
        return;
      }
      next(err);
    });
  };
};

// Documents are kept on disk because they are processed in the background
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // Random stored name so user input never becomes a file path
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
    },
  }),
  fileFilter: allowExtensions(SUPPORTED_EXTENSIONS),
  // Decode file names as UTF-8 so Thai names stay readable
  defParamCharset: 'utf8',
  limits,
});

// Images for /ocr are only needed during the request, so keep them in memory
const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: allowExtensions(IMAGE_EXTENSIONS),
  defParamCharset: 'utf8',
  limits,
});

// Bank statements are sensitive: keep them in memory only, never on disk
const statementUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: allowExtensions(['.pdf', ...IMAGE_EXTENSIONS]),
  defParamCharset: 'utf8',
  limits,
});

// One file in the "file" field
const singleFile = withErrorHandling(documentUpload.single('file'));

// One image in the "image" field (other text fields such as "prompt" are kept in req.body)
const singleImage = withErrorHandling(imageUpload.single('image'));

// One PDF or image in the "file" field (the "password" text field is kept in req.body)
const singleStatement = withErrorHandling(statementUpload.single('file'));

module.exports = { uploadDir, singleFile, singleImage, singleStatement };
