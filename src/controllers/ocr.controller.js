const ocrService = require('../services/ocr.service');
const asyncHandler = require('../utils/asyncHandler');

exports.ask = asyncHandler(async (req, res) => {
  const result = await ocrService.ask({
    file: req.file,
    prompt: req.body.prompt,
    format: req.body.format,
    schema: req.body.schema,
  });
  res.json({ success: true, data: result });
});
