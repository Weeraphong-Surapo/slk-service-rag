process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
process.env.QDRANT_URL = 'http://127.0.0.1:6333';
const fs = require('fs');
const out = 'calc-test.out.txt';
fs.writeFileSync(out, '');
const log = (...a) => fs.appendFileSync(out, a.join(' ') + '\n');

// [question, regex for the correct final answer]
const cases = [
  ['นายอนันต์มีเงินได้สุทธิหลังหักค่าใช้จ่ายและค่าลดหย่อนแล้วอยู่ที่ 650,000 บาท ภาษีเงินได้บุคคลธรรมดาที่นายอนันต์ต้องชำระคือเท่าใด? ก. 27,500 บาท ข. 65,000 บาท ค. 97,500 บาท ง. 50,000 บาท', /50,000/],
  ['นายอนันต์มีเงินได้สุทธิหลังหักค่าใช้จ่ายและค่าลดหย่อนแล้วอยู่ที่ 650,000 บาท ภาษีเงินได้บุคคลธรรมดาที่นายอนันต์ต้องชำระคือเท่าใด?', /50,000/],
  ['ถ้ามีเงินได้สุทธิ 400,000 บาท ต้องเสียภาษีเท่าไร', /17,500/],
  ['ถ้ามีเงินได้สุทธิ 1,200,000 บาท ต้องเสียภาษีเท่าไร', /165,000/],
  ['เงื่อนไขการเป็น SMEs ทางภาษีคืออะไร', /5 ล้าน/],
];

const finalLine = (answer) => {
  const lines = answer.split('\n').filter((l) => l.trim() !== '');
  return lines[lines.length - 1] || '';
};

(async () => {
  const chat = require('./src/services/chat.service');
  let pass = 0;
  let total = 0;
  for (const [question, expected] of cases) {
    for (let i = 1; i <= 2; i += 1) {
      total += 1;
      const t = Date.now();
      try {
        const r = await chat.ask({ question, topK: 5 });
        const ok = expected.test(finalLine(r.answer));
        if (ok) {
          pass += 1;
        }
        log(`${ok ? 'PASS' : 'FAIL'} | ${Date.now() - t} ms | run ${i} | Q: ${question.slice(0, 50)}`);
        log('   final:', JSON.stringify(finalLine(r.answer)));
        if (!ok) {
          log('   full:', JSON.stringify(r.answer));
        }
      } catch (err) {
        log('ERROR', err.message);
      }
    }
  }
  log(`RESULT ${pass}/${total}`);
})();
