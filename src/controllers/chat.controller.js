const chatService = require('../services/chat.service');
const asyncHandler = require('../utils/asyncHandler');

exports.ask = asyncHandler(async (req, res) => {
  const result = await chatService.ask(req.body);
  res.json({ success: true, data: result });
});
