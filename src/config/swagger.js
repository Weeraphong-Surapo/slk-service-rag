const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./index');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Express API',
      version: '1.0.0',
      description: 'API documentation',
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/v1`,
      },
    ],
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Alice' },
            email: { type: 'string', example: 'alice@example.com' },
          },
        },
        UserInput: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name: { type: 'string', example: 'Alice' },
            email: { type: 'string', example: 'alice@example.com' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'User not found' },
          },
        },
      },
    },
  },
  // Read @openapi JSDoc comments from route files
  apis: [path.join(__dirname, '../routes/*.js')],
};

module.exports = swaggerJsdoc(options);
