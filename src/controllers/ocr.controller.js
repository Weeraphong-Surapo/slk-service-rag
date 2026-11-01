const ocrService = require('../services/ocr.service');
const statementService = require('../services/statement.service');
const asyncHandler = require('../utils/asyncHandler');

exports.bankStatement = asyncHandler(async (req, res) => {
  const result = await statementService.extract({
    file: req.file,
    password: req.body.password,
  });
  res.json({ success: true, data: result });
});

exports.ask = asyncHandler(async (req, res) => {
  const result = await ocrService.ask({
    file: req.file,
    prompt: req.body.prompt,
    format: req.body.format,
    schema: req.body.schema,
  });
  res.json({ success: true, data: result });
});
