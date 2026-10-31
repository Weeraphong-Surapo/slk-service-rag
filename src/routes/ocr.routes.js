const express = require('express');
const ocrController = require('../controllers/ocr.controller');
const { singleImage } = require('../middlewares/upload.middleware');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: OCR
 *   description: Read text from an image and answer a prompt about it
 */

/**
 * @openapi
 * /ocr:
 *   post:
 *     tags: [OCR]
 *     summary: Read an image and return text, an answer or JSON
 *     description: |
 *       Reads the text in the image with Typhoon OCR, then builds only the output selected by `format`:
 *
 *       - `text`: OCR text only. Fastest, the chat model is not called.
 *       - `answer`: OCR text + `prompt` sent to the chat model, returns a text answer. `prompt` is required.
 *       - `json`: OCR text + `prompt` sent to the chat model, returns a JSON object.
 *         Send a JSON Schema in `schema` to fix the shape of the object.
 *
 *       Without `format`: `answer` when a prompt is sent, otherwise `text`.
 *       Supported types: .png, .jpg, .jpeg, .webp
 *
 *       ### Writing `schema`
 *
 *       `schema` is a [JSON Schema](https://json-schema.org/) sent as a string.
 *       It describes the JSON you want back. Do not send an example JSON object.
 *
 *       | Keyword | Use |
 *       |---|---|
 *       | `properties` | The field names you want. The response uses these names. |
 *       | `type` | `string`, `number`, `integer`, `boolean`, `array`, `object` |
 *       | `items` | The shape of each item in an array, for example a list of products. |
 *       | `required` | Fields that must exist in the response. The value is `null` when it is not in the image. |
 *       | `description` | Extra hint for the model, for example a date format or a currency. Improves accuracy. |
 *       | `enum` | Limits a field to fixed values, for example `["cash", "transfer", "card"]`. |
 *
 *       **Example**: to get this response
 *
 *       ```json
 *       {
 *         "invoiceNo": "INV-001",
 *         "date": "2026-10-31",
 *         "paymentMethod": "transfer",
 *         "items": [{ "name": "Latte", "qty": 2, "price": 60 }],
 *         "total": 120
 *       }
 *       ```
 *
 *       send this `schema`:
 *
 *       ```json
 *       {
 *         "type": "object",
 *         "properties": {
 *           "invoiceNo": { "type": "string" },
 *           "date": { "type": "string", "description": "Format YYYY-MM-DD" },
 *           "paymentMethod": { "type": "string", "enum": ["cash", "transfer", "card"] },
 *           "items": {
 *             "type": "array",
 *             "items": {
 *               "type": "object",
 *               "properties": {
 *                 "name": { "type": "string" },
 *                 "qty": { "type": "integer" },
 *                 "price": { "type": "number", "description": "Unit price in THB" }
 *               },
 *               "required": ["name", "qty", "price"]
 *             }
 *           },
 *           "total": { "type": "number", "description": "Total in THB, number only" }
 *         },
 *         "required": ["invoiceNo", "date", "paymentMethod", "items", "total"]
 *       }
 *       ```
 *
 *       **How the response is checked**
 *
 *       - The top level of `schema` must be `"type": "object"`. An invalid schema returns 400 before OCR starts.
 *       - Every field also accepts `null`, used when the value is not in the image.
 *       - The server validates the model reply against the schema and removes fields that are not in `properties`.
 *       - If the reply does not match, the errors are sent back to the model once to fix (adds a few seconds).
 *       - If it still does not match, the request returns 502. A 200 response always matches the schema.
 *
 *       The schema guarantees field names and types, not that the values are correct.
 *       OCR or the model can still misread a number. Check important values against `text`.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               format:
 *                 type: string
 *                 enum: [text, answer, json]
 *                 example: json
 *               prompt:
 *                 type: string
 *                 maxLength: 4000
 *                 example: Extract the store name, date, items and total
 *               schema:
 *                 type: string
 *                 maxLength: 10000
 *                 description: JSON Schema as a string, used only when format is json. See "Writing schema" above.
 *                 example: '{"type":"object","properties":{"storeName":{"type":"string"},"date":{"type":"string"},"items":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"qty":{"type":"number"},"price":{"type":"number"}},"required":["name","qty","price"]}},"total":{"type":"number"}},"required":["storeName","date","items","total"]}'
 *     responses:
 *       200:
 *         description: OCR text and answer
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/OcrResponse' }
 *       400:
 *         description: Missing image, unsupported type, invalid image, prompt too long or invalid schema
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Ollama is unavailable, or the model reply still did not match the schema after one fix
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/', singleImage, ocrController.ask);

module.exports = router;
