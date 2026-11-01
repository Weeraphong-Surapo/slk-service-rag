// Run bank/baank_test.png through the statement service and compare with the real values
process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
process.env.OLLAMA_JSON_FORMAT = 'off';
const fs = require('fs');

const out = 'bank-test.out.txt';
fs.writeFileSync(out, '');
const log = (...a) => fs.appendFileSync(out, a.join(' ') + '\n');

// [date, ref, debit, credit, balance] as printed on the image
const EXPECTED = [
  ['2003-10-14', null, null, 694.81, 695.36],
  ['2003-10-14', '9685', 200.00, null, 495.36],
  ['2003-10-16', '3990', 21.25, null, 474.11],
  ['2003-10-16', null, 1.50, null, 472.61],
  ['2003-10-20', '1975', 2.99, null, 469.62],
  ['2003-10-21', '3314', 300.00, null, 169.62],
  ['2003-10-22', '0064', 100.00, null, 69.62],
  ['2003-10-23', '1559', 29.08, null, 40.54],
  ['2003-10-24', '1975', null, 2.99, 43.53],
  ['2003-10-27', '2475', 6.77, null, 36.76],
  ['2003-10-28', null, null, 694.81, 731.57],
  ['2003-10-30', '2620', null, 50.00, 781.57],
  ['2003-11-03', null, 33.55, null, 748.02],
  ['2003-11-03', null, 100.00, null, 648.02],
  ['2003-11-06', null, 710.49, null, -62.47],
  ['2003-11-07', null, 5.00, null, -67.47],
  ['2003-11-08', null, 5.00, null, -72.47],
];

(async () => {
  const buffer = fs.readFileSync('bank/baank_test.png');
  const statement = require('./src/services/statement.service');

  // One extract call only, so the time is what a real request takes
  const t1 = Date.now();
  try {
    const result = await statement.extract({ file: { buffer, originalname: 'baank_test.png' } });
    log('extract ms', Date.now() - t1);
    log('account:', JSON.stringify(result.account));
    log('check:', JSON.stringify(result.check));
    log('rows returned:', result.transactions.length, 'expected:', EXPECTED.length);
    const n = Math.max(result.transactions.length, EXPECTED.length);
    for (let i = 0; i < n; i += 1) {
      const got = result.transactions[i];
      const exp = EXPECTED[i];
      let mark = 'OK ';
      if (got === undefined || exp === undefined
        || got.date !== exp[0] || got.debit !== exp[2] || got.credit !== exp[3] || got.balance !== exp[4]) {
        mark = 'BAD';
      }
      log(mark, i, 'got', JSON.stringify(got), '| exp', JSON.stringify(exp));
    }
  } catch (err) {
    log('ERROR', err.statusCode, err.message);
  }
  log('done');
})();
