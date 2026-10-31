const express = require('express');
const chatController = require('../controllers/chat.controller');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: Chat
 *   description: Ask questions about the uploaded documents
 */

/**
 * @openapi
 * /chat:
 *   post:
 *     tags: [Chat]
 *     summary: Ask a question (RAG)
 *     description: >
 *       Embeds the question, finds the closest chunks in Qdrant
 *       and asks the LLM to answer from those chunks only.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ChatRequest' }
 *     responses:
 *       200:
 *         description: Answer with sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/ChatResponse' }
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Ollama is unavailable
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', chatController.ask);

module.exports = router;
