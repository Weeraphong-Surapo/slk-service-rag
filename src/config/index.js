require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  // Swagger is off unless SWAGGER_ENABLED=true
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
};
