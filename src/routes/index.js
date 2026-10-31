const express = require('express');
const documentRoutes = require('./document.routes');
const chatRoutes = require('./chat.routes');
const ocrRoutes = require('./ocr.routes');

const router = express.Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Check server health
 *     responses:
 *       200:
 *         description: Server is running
 */
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'OK' });
});

router.use('/documents', documentRoutes);
router.use('/chat', chatRoutes);
router.use('/ocr', ocrRoutes);

module.exports = router;
