const AppError = require('../utils/AppError');

// Service: business logic / การเข้าถึงข้อมูล
// ตัวอย่างนี้ใช้ in-memory array ให้เปลี่ยนเป็น database (model/repository) ภายหลัง
let users = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
let nextId = 2;

exports.getAll = async () => users;

exports.getById = async (id) => {
  const user = users.find((u) => u.id === Number(id));
  if (!user) {
    throw new AppError('User not found', 404);
  }
  return user;
};

exports.create = async ({ name, email } = {}) => {
  if (!name || !email) {
    throw new AppError('name and email are required', 400);
  }
  const user = { id: nextId++, name, email };
  users.push(user);
  return user;
};

exports.update = async (id, { name, email } = {}) => {
  const user = await exports.getById(id);
  if (name !== undefined) {
    user.name = name;
  }
  if (email !== undefined) {
    user.email = email;
  }
  return user;
};

exports.remove = async (id) => {
  const user = await exports.getById(id);
  users = users.filter((u) => u.id !== user.id);
};
