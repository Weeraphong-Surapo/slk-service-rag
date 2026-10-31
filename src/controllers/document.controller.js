const documentService = require('../services/document.service');
const asyncHandler = require('../utils/asyncHandler');

exports.upload = asyncHandler(async (req, res) => {
  const document = await documentService.create(req.file);
  res.status(202).json({ success: true, data: document });
});

exports.getAll = asyncHandler(async (req, res) => {
  const documents = await documentService.getAll();
  res.json({ success: true, data: documents });
});

exports.getById = asyncHandler(async (req, res) => {
  const document = await documentService.getById(req.params.id);
  res.json({ success: true, data: document });
});

exports.remove = asyncHandler(async (req, res) => {
  await documentService.remove(req.params.id);
  res.status(204).send();
});
