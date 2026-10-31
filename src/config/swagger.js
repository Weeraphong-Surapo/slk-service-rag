const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'RAG API',
      version: '1.0.0',
      description: 'Document upload and question answering with Qdrant, MySQL and Ollama',
    },
    servers: [
      {
        // Relative URL works on any host/port (local or Docker)
        url: '/api/v1',
      },
    ],
    components: {
      schemas: {
        Document: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            original_name: { type: 'string', example: 'handbook.pdf' },
            mime_type: { type: 'string', example: 'application/pdf' },
            size_bytes: { type: 'integer', example: 204800 },
            status: { type: 'string', enum: ['processing', 'ready', 'failed'], example: 'ready' },
            chunk_count: { type: 'integer', example: 42 },
            error_message: { type: 'string', nullable: true, example: null },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        DocumentDetail: {
          allOf: [
            { $ref: '#/components/schemas/Document' },
            {
              type: 'object',
              properties: {
                stored_name: { type: 'string', example: '1730000000000-5f1c....pdf' },
                content: { type: 'string', nullable: true, description: 'Extracted raw text' },
              },
            },
          ],
        },
        ChatRequest: {
          type: 'object',
          required: ['question'],
          properties: {
            question: { type: 'string', example: 'นโยบายการลาพักร้อนเป็นอย่างไร' },
            topK: { type: 'integer', minimum: 1, maximum: 20, example: 5 },
          },
        },
        ChatSource: {
          type: 'object',
          properties: {
            ref: { type: 'integer', example: 1 },
            documentId: { type: 'integer', example: 1 },
            fileName: { type: 'string', example: 'handbook.pdf' },
            chunkIndex: { type: 'integer', example: 3 },
            score: { type: 'number', example: 0.82 },
            text: { type: 'string' },
          },
        },
        ChatResponse: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            sources: {
              type: 'array',
              items: { $ref: '#/components/schemas/ChatSource' },
            },
          },
        },
        OcrResponse: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['text', 'answer', 'json'], example: 'json' },
            text: { type: 'string', description: 'Text read from the image (Markdown, tables as HTML). Always set.' },
            answer: { type: 'string', nullable: true, description: 'Text answer. Set only when format is answer.' },
            json: {
              type: 'object',
              nullable: true,
              additionalProperties: true,
              description: 'Extracted JSON object. Set only when format is json.',
              example: { storeName: 'ร้าน ABC', date: '2026-10-31', items: [{ name: 'กาแฟ', qty: 2, price: 60 }], total: 120 },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Document not found' },
          },
        },
      },
    },
  },
  // Read @openapi JSDoc comments from route files
  apis: [path.join(__dirname, '../routes/*.js')],
};

module.exports = swaggerJsdoc(options);
