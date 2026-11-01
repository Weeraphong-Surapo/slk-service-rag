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
        BankStatementResponse: {
          type: 'object',
          properties: {
            account: {
              type: 'object',
              properties: {
                bankName: { type: 'string', nullable: true, example: 'Example Bank' },
                accountNo: { type: 'string', nullable: true, example: '123-4-56789-0' },
                accountName: { type: 'string', nullable: true, example: 'ABC Co., Ltd.' },
                periodFrom: { type: 'string', nullable: true, example: '2026-10-01' },
                periodTo: { type: 'string', nullable: true, example: '2026-10-31' },
                periodFromRaw: { type: 'string', nullable: true, example: '01/10/2569' },
                periodToRaw: { type: 'string', nullable: true, example: '31/10/2569' },
                openingBalance: { type: 'number', nullable: true, example: 50000 },
                closingBalance: {
                  type: 'number',
                  nullable: true,
                  example: 61250,
                  description: 'Printed closing balance, or the last row balance when none is printed (see check.closingBalanceSource)',
                },
                totalDebit: { type: 'number', nullable: true, example: 3750, description: 'Total withdrawals printed on the statement' },
                totalCredit: { type: 'number', nullable: true, example: 15000, description: 'Total deposits printed on the statement' },
                currency: { type: 'string', nullable: true, example: 'THB' },
              },
            },
            transactions: {
              type: 'array',
              description: 'Always oldest first',
              items: {
                type: 'object',
                properties: {
                  page: { type: 'integer', example: 1 },
                  date: { type: 'string', nullable: true, example: '2026-10-03' },
                  dateRaw: { type: 'string', nullable: true, example: '03/10/69' },
                  time: { type: 'string', nullable: true, example: '14:05' },
                  description: { type: 'string', nullable: true, example: 'Transfer in' },
                  debit: { type: 'number', nullable: true, example: null },
                  credit: { type: 'number', nullable: true, example: 15000 },
                  balance: { type: 'number', nullable: true, example: 65000 },
                },
              },
            },
            check: {
              type: 'object',
              properties: {
                balanceOk: { type: 'boolean', example: true },
                order: { type: 'string', enum: ['oldest-first', 'newest-first'], example: 'oldest-first' },
                transactionCount: { type: 'integer', example: 2 },
                firstRowChecked: { type: 'boolean', example: true },
                closingBalanceOk: {
                  type: 'boolean',
                  nullable: true,
                  example: true,
                  description: 'Printed closing balance equals the last row balance. null when no closing balance is printed',
                },
                closingBalanceSource: {
                  type: 'string',
                  nullable: true,
                  enum: ['printed', 'last-row', null],
                  example: 'printed',
                },
                totalsOk: {
                  type: 'boolean',
                  nullable: true,
                  example: true,
                  description: 'Sum of rows equals the printed totals row. null when no totals are printed. '
                    + 'false with rowsProven true means the totals row was misread; use sumDebit and sumCredit',
                },
                rowsProven: {
                  type: 'boolean',
                  example: true,
                  description: 'Every row has a balance and adds up from the opening balance, so every amount is confirmed',
                },
                sumDebit: { type: 'number', example: 3750, description: 'Sum of debit in transactions' },
                sumCredit: { type: 'number', example: 15000, description: 'Sum of credit in transactions' },
                skippedBalanceRows: {
                  type: 'integer',
                  example: 1,
                  description: 'Rows with a balance but no amount (e.g. Previous balance) that were not counted as transactions',
                },
                correctedRows: {
                  type: 'array',
                  description: 'Rows where debit and credit were swapped because the balance proved the direction',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer' },
                      page: { type: 'integer' },
                      date: { type: 'string', nullable: true },
                      description: { type: 'string', nullable: true },
                      fix: { type: 'string', example: 'swapped debit/credit' },
                    },
                  },
                  example: [],
                },
                mismatchedRows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      index: { type: 'integer', description: 'Position in transactions' },
                      page: { type: 'integer' },
                      date: { type: 'string', nullable: true },
                      description: { type: 'string', nullable: true },
                      expectedBalance: { type: 'number' },
                      balance: { type: 'number' },
                      difference: { type: 'number' },
                    },
                  },
                  example: [],
                },
                pageCount: { type: 'integer', example: 1 },
                ocrPages: { type: 'array', items: { type: 'integer' }, example: [] },
                tablePages: {
                  type: 'array',
                  items: { type: 'integer' },
                  example: [1],
                  description: 'Pages whose rows were read from the OCR table by code; other pages were read by the model',
                },
              },
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
