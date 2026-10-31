// Real end-to-end check after the fix: 900px image through ocr.service (upscale + greedy OCR + JSON)
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');

fs.writeFileSync('value-test.out.txt', '');
const log = (...a) => fs.appendFileSync('value-test.out.txt', a.join(' ') + '\n');

(async () => {
  const canvas = createCanvas(900, 480);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 900, 480);
  ctx.fillStyle = '#000';
  ctx.font = '36px Tahoma';
  ctx.fillText('ใบแจ้งหนี้ เลขที่ INV-0042', 40, 70);
  ctx.fillText('วันที่ 31/10/2026', 40, 140);
  ctx.fillText('ลาเต้เย็น  2 แก้ว  120 บาท', 40, 210);
  ctx.fillText('ครัวซองต์  1 ชิ้น  65 บาท', 40, 280);
  ctx.fillText('รวมทั้งสิ้น 185 บาท', 40, 350);
  ctx.fillText('ชำระโดย: โอนเงิน', 40, 420);
  const file = { buffer: await canvas.encode('png') };

  const schema = JSON.stringify({
    type: 'object',
    properties: {
      invoiceNo: { type: 'string' },
      date: { type: 'string', description: 'Format YYYY-MM-DD' },
      paymentMethod: { type: 'string', enum: ['cash', 'transfer', 'card'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            qty: { type: 'integer' },
            amount: { type: 'number', description: 'Amount written on the line in THB' },
          },
          required: ['name', 'qty', 'amount'],
        },
      },
      total: { type: 'number', description: 'Total written on the document in THB' },
    },
    required: ['invoiceNo', 'date', 'paymentMethod', 'items', 'total'],
  });

  const ocr = require('./src/services/ocr.service');
  for (let i = 1; i <= 3; i += 1) {
    const started = Date.now();
    try {
      const result = await ocr.ask({ file, format: 'json', prompt: 'ดึงข้อมูลใบแจ้งหนี้', schema });
      const ok = result.json.total === 185
        && result.json.items.length === 2
        && result.json.items[0].qty === 2
        && result.json.items[0].amount === 120
        && result.json.items[1].amount === 65;
      log(`run ${i}`, ok ? 'CORRECT' : 'WRONG', `${Date.now() - started}ms`, JSON.stringify(result.json));
    } catch (err) {
      log(`run ${i}`, 'ERROR', err.statusCode, err.message);
    }
  }
  log('done');
})();
