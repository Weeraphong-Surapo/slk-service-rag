const config = require('../config');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational === true;

  let message = 'Internal Server Error';

  if (isOperational) {
    message = err.message;
  } else {
    console.error(err);
  }

  const body = {
    success: false,
    message,
  };

  if (config.env === 'development') {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};
