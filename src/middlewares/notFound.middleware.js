const AppError = require('../utils/AppError');

module.exports = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};
