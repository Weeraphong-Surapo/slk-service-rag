const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');

// Controller: รับ request / ส่ง response เท่านั้น ส่วน logic อยู่ใน service

exports.getAll = asyncHandler(async (req, res) => {
  const users = await userService.getAll();
  res.json({ success: true, data: users });
});

exports.getById = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  res.json({ success: true, data: user });
});

exports.create = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body);
  res.status(201).json({ success: true, data: user });
});

exports.update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body);
  res.json({ success: true, data: user });
});

exports.remove = asyncHandler(async (req, res) => {
  await userService.remove(req.params.id);
  res.status(204).send();
});
