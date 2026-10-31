const express = require('express');
const documentController = require('../controllers/document.controller');
const { singleFile } = require('../middlewares/upload.middleware');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: Documents
 *   description: Upload and manage source documents
 */

/**
 * @openapi
 * /documents:
 *   post:
 *     tags: [Documents]
 *     summary: Upload a document
 *     description: >
 *       Saves the file and starts processing in the background
 *       (extract text, split into chunks, embed, store in Qdrant).
 *       Poll GET /documents/{id} until status is "ready" or "failed".
 *       Supported types: .pdf, .docx, .txt, .md
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       202:
 *         description: Upload accepted, processing started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Document' }
 *       400:
 *         description: Missing file, unsupported type or file too large
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', singleFile, documentController.upload);

/**
 * @openapi
 * /documents:
 *   get:
 *     tags: [Documents]
 *     summary: Get all documents
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Document' }
 */
router.get('/', documentController.getAll);

/**
 * @openapi
 * /documents/{id}:
 *   get:
 *     tags: [Documents]
 *     summary: Get a document by ID, including the extracted text
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/DocumentDetail' }
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', documentController.getById);

/**
 * @openapi
 * /documents/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Delete a document, its vectors and its file
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204:
 *         description: Document deleted
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.delete('/:id', documentController.remove);

module.exports = router;
