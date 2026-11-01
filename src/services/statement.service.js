const path = require('path');
const config = require('../config');
const AppError = require('../utils/AppError');
const { readPdfPages, IMAGE_EXTENSIONS } = require('../utils/textExtractor');
const { compileSchema } = require('../utils/jsonSchema');
const { normalizeDate, normalizeAmount } = require('../utils/statementValues');
const { parseStatementTables } = require('../utils/statementTable');
const ocrService = require('./ocr.service');

// Amounts are compared after rounding to satang
const CENT = 0.005;

const SOURCE_LABEL = 'Text from a bank statement page';

// Works for any bank: the model reads the layout, the code checks the numbers
const ACCOUNT_SCHEMA = compileSchema({
  type: 'object',
  properties: {
    bankName: { type: 'string', description: 'Bank name as written' },
    accountNo: { type: 'string', description: 'Account number as written, keep dashes' },
    accountName: { type: 'string', description: 'Account holder name' },
    periodFrom: { type: 'string', description: 'Start date of the statement period, copied exactly as written' },
    periodTo: { type: 'string', description: 'End date of the statement period, copied exactly as written' },
    openingBalance: {
      type: 'number',
      description: 'Balance at the start of the period (opening balance, balance brought forward, ยอดยกมา)',
    },
    closingBalance: {
      type: 'number',
      description: 'Closing balance printed with a label such as Closing balance, Ending balance, ยอดคงเหลือปลายงวด or ยอดยกไป. '
        + 'Not a total of withdrawals or deposits. null if no closing balance is printed',
    },
    totalDebit: {
      type: 'number',
      description: 'Total withdrawals printed in a totals row (Totals, Total debit, รวมถอน). null if not printed',
    },
    totalCredit: {
      type: 'number',
      description: 'Total deposits printed in a totals row (Totals, Total credit, รวมฝาก). null if not printed',
    },
    currency: { type: 'string', description: 'Currency code, for example THB' },
  },
  required: [
    'bankName', 'accountNo', 'accountName', 'periodFrom', 'periodTo',
    'openingBalance', 'closingBalance', 'totalDebit', 'totalCredit', 'currency',
  ],
});

const ACCOUNT_PROMPT = [
  'Extract the account details and the statement summary.',
  'A totals row gives totalDebit and totalCredit, never closingBalance.',
  'Write amounts as plain numbers without commas or currency symbols.',
].join(' ');

const TRANSACTIONS_SCHEMA = compileSchema({
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Transaction date copied exactly as written' },
          time: { type: 'string', description: 'Transaction time as written, null if not shown' },
          description: { type: 'string', description: 'Description, channel or code of the transaction as written' },
          debit: {
            type: 'number',
            description: 'Money out (withdrawal, ถอน, จ่าย) as a positive number. null if the row is money in',
          },
          credit: {
            type: 'number',
            description: 'Money in (deposit, ฝาก, รับ) as a positive number. null if the row is money out',
          },
          balance: { type: 'number', description: 'Balance after this row as written. null if not shown' },
        },
        required: ['date', 'time', 'description', 'debit', 'credit', 'balance'],
      },
    },
    totals: {
      type: 'object',
      description: 'The totals row on this page (Totals, รวม), read with the same columns as the rows. null if there is no totals row',
      properties: {
        debit: { type: 'number', description: 'Number in the withdrawals / debit column of the totals row' },
        credit: { type: 'number', description: 'Number in the deposits / credit column of the totals row' },
      },
      required: ['debit', 'credit'],
    },
  },
  required: ['transactions', 'totals'],
});

const TRANSACTIONS_PROMPT = [
  'List every transaction row on this page, in the same order as on the page. Do not skip any row.',
  'Skip column headers, previous balance or brought forward rows (Previous balance, ยอดยกมา),',
  'carried forward rows (ยอดยกไป), and total or summary rows (Totals, รวม).',
  'Use the column headers to place each amount: Withdrawals, Debit, ถอน, เดบิต go to debit;',
  'Deposits, Credit, ฝาก, เครดิต go to credit. An empty cell is null.',
  'If there is one amount column with a sign, a minus, or a DR/CR marker, put money out in debit and money in in credit.',
  'Write amounts as plain numbers without commas or currency symbols.',
  'If the page has a totals row, put its numbers in totals, each under its own column; otherwise totals is null.',
  'If the page has no transactions, return {"transactions": [], "totals": null}.',
].join(' ');

// Clean amounts before validation so "1,250.00" does not need a retry
const prepareAccount = (value) => {
  value.openingBalance = normalizeAmount(value.openingBalance);
  value.closingBalance = normalizeAmount(value.closingBalance);
  value.totalDebit = normalizeAmount(value.totalDebit);
  value.totalCredit = normalizeAmount(value.totalCredit);
};

const prepareTransactions = (value) => {
  if (value.totals !== null && typeof value.totals === 'object') {
    value.totals.debit = normalizeAmount(value.totals.debit);
    value.totals.credit = normalizeAmount(value.totals.credit);
  }
  if (!Array.isArray(value.transactions)) {
    return;
  }
  for (const row of value.transactions) {
    if (row !== null && typeof row === 'object') {
      row.debit = normalizeAmount(row.debit);
      row.credit = normalizeAmount(row.credit);
      row.balance = normalizeAmount(row.balance);
    }
  }
};

const roundCents = (value) => {
  return Math.round(value * 100) / 100;
};

const amountOrZero = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  return 0;
};

const balanceAfter = (previous, credit, debit) => {
  return roundCents(previous + amountOrZero(credit) - amountOrZero(debit));
};

const sameAmount = (a, b) => {
  return Math.abs(a - b) <= CENT;
};

// Every row must satisfy: previous balance + credit - debit = balance.
// When a row has one amount on the wrong side (money in read as money out) and swapping it
// makes the balance add up, the balance proves the direction, so the row is corrected.
// Works on copies, so both orders can be tried.
const walkBalances = (inputRows, openingBalance) => {
  const rows = inputRows.map((row) => {
    return { ...row };
  });
  const mismatches = [];
  const corrections = [];
  let previous = openingBalance;

  rows.forEach((row, index) => {
    if (row.balance === null) {
      return;
    }
    if (typeof previous === 'number') {
      const expected = balanceAfter(previous, row.credit, row.debit);
      const swapped = balanceAfter(previous, row.debit, row.credit);
      const hasOneAmount = (row.debit === null) !== (row.credit === null);

      if (!sameAmount(expected, row.balance) && hasOneAmount && sameAmount(swapped, row.balance)) {
        const debit = row.debit;
        row.debit = row.credit;
        row.credit = debit;
        corrections.push({ index, page: row.page, date: row.date, description: row.description, fix: 'swapped debit/credit' });
      } else if (!sameAmount(expected, row.balance)) {
        mismatches.push({
          index,
          page: row.page,
          date: row.date,
          description: row.description,
          expectedBalance: expected,
          balance: row.balance,
          difference: roundCents(row.balance - expected),
        });
      }
    }
    previous = row.balance;
  });

  return { rows, mismatches, corrections };
};

// Some banks list the newest row first. Check both orders and keep the one that fits.
// Rows are always returned oldest first.
const checkBalances = (rows, account) => {
  const asWritten = walkBalances(rows, account.openingBalance);
  const reversed = walkBalances([...rows].reverse(), account.openingBalance);

  const problems = (walk) => {
    return walk.mismatches.length * 1000 + walk.corrections.length;
  };

  let order = 'oldest-first';
  let chosen = asWritten;
  if (problems(reversed) < problems(asWritten)) {
    order = 'newest-first';
    chosen = reversed;
  }
  const ordered = chosen.rows;
  const mismatches = chosen.mismatches;

  const totals = checkTotals(ordered, account);
  const closingBalanceSource = resolveClosingBalance(account, ordered, totals);

  // Only a printed closing balance is an independent check
  let closingBalanceOk = null;
  const last = ordered[ordered.length - 1];
  if (closingBalanceSource === 'printed' && last !== undefined && typeof last.balance === 'number') {
    closingBalanceOk = sameAmount(account.closingBalance, last.balance);
  }

  let firstRowChecked = typeof account.openingBalance === 'number';
  if (ordered.length === 0) {
    firstRowChecked = false;
  }

  // When every row has a balance and every step adds up from the opening balance,
  // each amount equals the change in balance, so the rows are proven correct.
  // A printed total that disagrees then means the totals row was misread, not the rows.
  const everyRowHasBalance = ordered.every((row) => {
    return typeof row.balance === 'number';
  });
  const rowsProven = ordered.length > 0 && mismatches.length === 0 && firstRowChecked && everyRowHasBalance;

  return {
    ordered,
    check: {
      balanceOk: ordered.length > 0 && mismatches.length === 0 && closingBalanceOk !== false
        && (totals.totalsOk !== false || rowsProven),
      rowsProven,
      order,
      transactionCount: ordered.length,
      firstRowChecked,
      closingBalanceOk,
      closingBalanceSource,
      totalsOk: totals.totalsOk,
      sumDebit: totals.sumDebit,
      sumCredit: totals.sumCredit,
      mismatchedRows: mismatches,
      correctedRows: chosen.corrections,
    },
  };
};

const sumOf = (rows, field) => {
  let total = 0;
  for (const row of rows) {
    total += amountOrZero(row[field]);
  }
  return roundCents(total);
};

// Compare the sum of the rows with the totals row printed on the statement (if any)
const checkTotals = (rows, account) => {
  const sumDebit = sumOf(rows, 'debit');
  const sumCredit = sumOf(rows, 'credit');

  let totalsOk = null;
  if (typeof account.totalDebit === 'number' || typeof account.totalCredit === 'number') {
    totalsOk = true;
    if (typeof account.totalDebit === 'number' && !sameAmount(account.totalDebit, sumDebit)) {
      totalsOk = false;
    }
    if (typeof account.totalCredit === 'number' && !sameAmount(account.totalCredit, sumCredit)) {
      totalsOk = false;
    }
  }
  return { totalsOk, sumDebit, sumCredit };
};

// Decide the closing balance:
// - printed and matches a total (the model picked a totals row by mistake): ignore it
// - not printed: use the balance of the last row, which is the closing balance by definition
const resolveClosingBalance = (account, ordered, sums) => {
  const last = ordered[ordered.length - 1];
  let lastBalance = null;
  if (last !== undefined && typeof last.balance === 'number') {
    lastBalance = last.balance;
  }

  if (typeof account.closingBalance === 'number') {
    const isATotal = sameAmount(account.closingBalance, sums.sumDebit) || sameAmount(account.closingBalance, sums.sumCredit)
      || (typeof account.totalDebit === 'number' && sameAmount(account.closingBalance, account.totalDebit))
      || (typeof account.totalCredit === 'number' && sameAmount(account.closingBalance, account.totalCredit));
    const matchesLastRow = lastBalance !== null && sameAmount(account.closingBalance, lastBalance);
    if (!isATotal || matchesLastRow) {
      return 'printed';
    }
    account.closingBalance = null;
  }

  if (lastBalance !== null) {
    account.closingBalance = lastBalance;
    return 'last-row';
  }
  return null;
};

// Rows with only a balance and no amount are not transactions
// (e.g. "Previous balance", "ยอดยกมา", "Balance forward"). The first one gives the opening balance.
const splitBalanceOnlyRows = (rows, account) => {
  const transactions = [];
  let skipped = 0;

  for (const row of rows) {
    if (row.debit === null && row.credit === null) {
      skipped += 1;
      if (account.openingBalance === null && transactions.length === 0 && typeof row.balance === 'number') {
        account.openingBalance = row.balance;
      }
    } else {
      transactions.push(row);
    }
  }
  return { transactions, skipped };
};

const readPages = async (file, password) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (IMAGE_EXTENSIONS.includes(extension)) {
    return [{ num: 1, text: await ocrService.ocrImage(file.buffer), ocr: true }];
  }
  return readPdfPages(file.buffer, {
    password,
    maxPages: config.statement.maxPages,
    label: 'statement',
  });
};

// Header details are on the first page; the closing balance is often on the last page
const accountText = (pages) => {
  if (pages.length === 1) {
    return pages[0].text;
  }
  return `${pages[0].text}\n\n--- last page ---\n\n${pages[pages.length - 1].text}`;
};

exports.extract = async ({ file, password }) => {
  if (!file) {
    throw new AppError('file is required (multipart field "file")', 400);
  }

  let pdfPassword;
  if (typeof password === 'string' && password !== '') {
    pdfPassword = password;
  }

  const pages = await readPages(file, pdfPassword);

  const account = await ocrService.extractJson(accountText(pages), ACCOUNT_PROMPT, ACCOUNT_SCHEMA, {
    sourceLabel: SOURCE_LABEL,
    prepare: prepareAccount,
  });
  account.periodFromRaw = account.periodFrom;
  account.periodToRaw = account.periodTo;
  account.periodFrom = normalizeDate(account.periodFrom);
  account.periodTo = normalizeDate(account.periodTo);

  // One page at a time keeps each reply short, so rows are not skipped
  const rows = [];
  let pageTotals = null;
  const tablePages = [];
  for (const page of pages) {
    // OCR pages come back with HTML tables: read them in code (fast, exact).
    // Text-layer PDF pages, or tables without recognisable columns, go to the model.
    let result = null;
    if (page.ocr) {
      result = parseStatementTables(page.text);
    }
    if (result !== null && result.transactions.length > 0) {
      tablePages.push(page.num);
      console.log(`Statement transactions page ${page.num}/${pages.length}: read from table`);
    } else {
      console.log(`Statement transactions page ${page.num}/${pages.length}: read by model`);
      result = await ocrService.extractJson(page.text, TRANSACTIONS_PROMPT, TRANSACTIONS_SCHEMA, {
        sourceLabel: SOURCE_LABEL,
        prepare: prepareTransactions,
      });
    }
    // The totals row is read here, with the same column mapping as the rows.
    // The grand total is usually on the last page, so a later page wins.
    if (result.totals !== null && typeof result.totals === 'object'
      && (typeof result.totals.debit === 'number' || typeof result.totals.credit === 'number')) {
      pageTotals = result.totals;
    }

    // Every field may be null, including the list itself and rows inside it
    let pageRows = [];
    if (Array.isArray(result.transactions)) {
      pageRows = result.transactions.filter((row) => {
        return row !== null;
      });
    }
    for (const row of pageRows) {
      rows.push({
        page: page.num,
        date: normalizeDate(row.date),
        dateRaw: row.date,
        time: row.time,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
      });
    }
  }

  // Prefer totals read together with the table columns over the header pass
  if (pageTotals !== null) {
    account.totalDebit = pageTotals.debit;
    account.totalCredit = pageTotals.credit;
  }

  const { transactions, skipped } = splitBalanceOnlyRows(rows, account);
  const { ordered, check } = checkBalances(transactions, account);
  check.skippedBalanceRows = skipped;
  check.pageCount = pages.length;
  check.tablePages = tablePages;
  check.ocrPages = pages
    .filter((page) => {
      return page.ocr;
    })
    .map((page) => {
      return page.num;
    });

  return { account, transactions: ordered, check };
};

// Exported for tests
exports.checkBalances = checkBalances;
