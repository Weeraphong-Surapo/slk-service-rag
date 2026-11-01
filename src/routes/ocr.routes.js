const express = require('express');
const ocrController = require('../controllers/ocr.controller');
const { singleImage, singleStatement } = require('../middlewares/upload.middleware');

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
 *         Send `schema` to fix the shape of the object.
 *
 *       Without `format`: `answer` when a prompt is sent, otherwise `text`.
 *       Supported types: .png, .jpg, .jpeg, .webp
 *
 *       ### Writing `schema` (simple form, recommended)
 *
 *       Write the JSON you want back, with a type name as the value of each field:
 *
 *       ```json
 *       {
 *         "storeName": "string",
 *         "date": "string",
 *         "items": [{ "name": "string", "qty": "number", "price": "number", "totalPrice": "number" }],
 *         "total": "number"
 *       }
 *       ```
 *
 *       | Write | Meaning |
 *       |---|---|
 *       | `"string"`, `"number"`, `"integer"`, `"boolean"` | Field type |
 *       | `[ { ... } ]` | A list. Put one item template inside, for example a product row. |
 *       | `{ ... }` | A nested object |
 *
 *       Every field is returned. The value is `null` when it is not in the image.
 *
 *       ### Writing `schema` (full JSON Schema, advanced)
 *
 *       Use a full [JSON Schema](https://json-schema.org/) when you need `description` or `enum`.
 *       It is detected when the top level has `"type": "object"` and `"properties"`.
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
 *       Example with `description` and `enum`:
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
 *       - An invalid `schema` returns 400 before OCR starts. The message shows the position of a JSON syntax error.
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
 *                 # Declared as an object so Swagger UI shows a multi-line text box.
 *                 # It is still sent as JSON text in the form (max 10000 characters).
 *                 type: object
 *                 additionalProperties: true
 *                 description: Shape of the JSON to return, used only when format is json. Simple form or full JSON Schema, see "Writing schema" above.
 *                 example:
 *                   storeName: string
 *                   date: string
 *                   items:
 *                     - name: string
 *                       qty: number
 *                       price: number
 *                       totalPrice: number
 *                   total: number
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

/**
 * @openapi
 * /ocr/bank-statement:
 *   post:
 *     tags: [OCR]
 *     summary: Read a bank statement and return the account and every transaction as JSON
 *     description: |
 *       Works with statements from any bank. The layout is read by the model, and the numbers are checked by the server.
 *
 *       **Input**: a PDF (from the bank app or website, or scanned) or a photo (.png, .jpg, .jpeg, .webp).
 *       Send `password` if the PDF is locked.
 *
 *       **How it works**
 *
 *       1. Each PDF page uses its text layer. Pages with no text or broken Thai text are read with Typhoon OCR.
 *       2. The account details are read from the first and last page.
 *       3. Transactions are read one page at a time. On OCR pages the table columns (Date, Withdrawals/ถอน,
 *          Deposits/ฝาก, Balance/คงเหลือ) are read by code, which is fast and exact (`check.tablePages`).
 *          Other pages are read by the model.
 *       4. Dates are converted to `YYYY-MM-DD` (Buddhist years such as 2569 become 2026). The original is kept in `dateRaw`.
 *       5. Every row is checked: previous balance + credit - debit = balance.
 *
 *       **Reading `check`**
 *
 *       - `balanceOk: true`: every row adds up, and the printed closing balance and totals (when printed) match.
 *       - `closingBalanceSource`: `printed` when the statement prints a closing balance, `last-row` when it does not
 *         and the last row balance is used.
 *       - `rowsProven: true`: every row has a balance and adds up from the opening balance, so every amount is confirmed.
 *       - `totalsOk`: the sum of the rows equals the printed totals row. `null` when no totals are printed.
 *         `false` while `rowsProven` is `true` means the totals row was misread; trust `sumDebit` and `sumCredit`.
 *       - `correctedRows`: rows where money in and money out were swapped; the balance proved the direction, so they were fixed.
 *       - `mismatchedRows`: rows where the balance does not add up. The row before or this row was misread, or a row is missing.
 *       - `order`: `newest-first` when the bank lists the latest row first. `transactions` are always returned oldest first.
 *       - `firstRowChecked: false`: no opening balance was found, so the first row could not be checked.
 *
 *       The file is processed in memory and not saved. Expect about 10-60 seconds per page.
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
 *               password:
 *                 type: string
 *                 format: password
 *                 description: PDF password, if the file is locked
 *     responses:
 *       200:
 *         description: Account details, transactions and balance check
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/BankStatementResponse' }
 *       400:
 *         description: Missing file, unsupported type, invalid PDF, missing or wrong password, or too many pages
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Ollama is unavailable, or the model reply did not match the expected JSON after one fix
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/bank-statement', singleStatement, ocrController.bankStatement);

module.exports = router;
