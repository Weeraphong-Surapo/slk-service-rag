const express = require('express');
const userRoutes = require('./user.routes');

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

router.use('/users', userRoutes);

module.exports = router;
