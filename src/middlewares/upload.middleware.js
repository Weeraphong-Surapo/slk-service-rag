const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const AppError = require('../utils/AppError');
const { SUPPORTED_EXTENSIONS } = require('../utils/textExtractor');

const uploadDir = path.resolve(config.upload.dir);
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  // Random stored name so user input never becomes a file path
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    cb(new AppError(`Unsupported file type. Allowed: ${SUPPORTED_EXTENSIONS.join(', ')}`, 400));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  // Decode file names as UTF-8 so Thai names stay readable
  defParamCharset: 'utf8',
  limits: { fileSize: config.upload.maxFileSizeMb * 1024 * 1024 },
});

// Accept one file in the "file" field and turn multer errors into 400 responses
const singleFile = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      next(new AppError(err.message, 400));
      return;
    }
    next(err);
  });
};

module.exports = { uploadDir, singleFile };
