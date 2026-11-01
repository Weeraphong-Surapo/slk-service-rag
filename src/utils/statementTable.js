// Read bank statement rows straight from the HTML tables that Typhoon OCR returns.
// Code instead of the chat model: much faster and it cannot invent or mistype numbers.
// Returns null when no table has recognisable columns, so the caller can fall back to the model.

const { normalizeAmount, normalizeDate } = require('./statementValues');

// Header keywords per column, Thai and English. Short codes (dr, cr) must match the whole header.
const COLUMN_KEYWORDS = {
  balance: ['balance', 'คงเหลือ'],
  debit: ['withdrawal', 'debit', 'paid out', 'money out', 'ถอน', 'เดบิต', 'จ่าย'],
  credit: ['deposit', 'credit', 'paid in', 'money in', 'ฝาก', 'เครดิต', 'รับ'],
  date: ['date', 'วันที่', 'วัน/เดือน/ปี'],
  time: ['time', 'เวลา'],
  description: ['description', 'detail', 'particular', 'transaction', 'รายการ', 'รายละเอียด', 'ประเภท', 'ช่องทาง'],
};
const EXACT_KEYWORDS = { debit: ['dr', 'dr.'], credit: ['cr', 'cr.'] };
// Check balance first so "ยอดคงเหลือ" is never read as another column
const COLUMN_ORDER = ['balance', 'debit', 'credit', 'date', 'time', 'description'];
const REQUIRED_COLUMNS = ['date', 'debit', 'credit', 'balance'];

const TOTAL_WORDS = /total|รวม/i;

const decodeEntities = (text) => {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (match, code) => {
      return String.fromCharCode(Number(code));
    });
};

const cellText = (html) => {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
};

// Split a <table> into rows of cell texts. colspan cells are expanded so columns stay aligned.
const parseTable = (tableHtml) => {
  const rows = [];
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi);
  if (rowMatches === null) {
    return rows;
  }

  for (const rowHtml of rowMatches) {
    const cells = [];
    const cellRegex = /<t([dh])([^>]*)>([\s\S]*?)<\/t\1>/gi;
    let match = cellRegex.exec(rowHtml);
    while (match !== null) {
      cells.push(cellText(match[3]));
      const span = match[2].match(/colspan\s*=\s*["']?(\d+)/i);
      if (span) {
        for (let i = 1; i < Number(span[1]); i += 1) {
          cells.push('');
        }
      }
      match = cellRegex.exec(rowHtml);
    }
    rows.push(cells);
  }
  return rows;
};

const matchesColumn = (header, column) => {
  const text = header.toLowerCase();
  const exact = EXACT_KEYWORDS[column];
  if (exact !== undefined && exact.includes(text)) {
    return true;
  }
  return COLUMN_KEYWORDS[column].some((keyword) => {
    return text.includes(keyword);
  });
};

// Map column names to cell positions, or null when the row is not a statement header
const mapHeader = (cells) => {
  const map = {};
  for (const column of COLUMN_ORDER) {
    const index = cells.findIndex((cell, position) => {
      const taken = Object.values(map).includes(position);
      return !taken && cell !== '' && matchesColumn(cell, column);
    });
    if (index !== -1) {
      map[column] = index;
    }
  }
  // Also use the reference column as part of the description when there is no description column
  if (map.description === undefined) {
    const refIndex = cells.findIndex((cell) => {
      return /ref|อ้างอิง/i.test(cell);
    });
    if (refIndex !== -1) {
      map.description = refIndex;
    }
  }

  const complete = REQUIRED_COLUMNS.every((column) => {
    return map[column] !== undefined;
  });
  if (!complete) {
    return null;
  }
  return map;
};

const cellAt = (cells, index) => {
  if (index === undefined || index >= cells.length) {
    return '';
  }
  return cells[index];
};

// '' -> null, '1,250.00' -> 1250; undefined when the text is not a number (table is not trusted)
const readAmount = (text) => {
  if (text === '' || text === '-') {
    return null;
  }
  const value = normalizeAmount(text);
  if (typeof value !== 'number') {
    return undefined;
  }
  return value;
};

// OCR often gives the totals row a different number of cells (the label spans several columns),
// so its numbers can sit one column off. With two or more numbers, read them in order instead:
// the first belongs to whichever of debit/credit comes first in the header.
const readTotals = (cells, map, debitAtColumn, creditAtColumn) => {
  const numbers = [];
  for (const cell of cells) {
    const value = readAmount(cell);
    if (typeof value === 'number') {
      numbers.push(value);
    }
  }

  if (numbers.length < 2) {
    return { debit: debitAtColumn, credit: creditAtColumn };
  }
  if (map.debit < map.credit) {
    return { debit: numbers[0], credit: numbers[1] };
  }
  return { debit: numbers[1], credit: numbers[0] };
};

// Turn the body rows of one table into transactions. Returns null if any amount is unreadable.
const readBody = (bodyRows, map) => {
  const rows = [];
  let totals = null;

  for (const cells of bodyRows) {
    const isEmpty = cells.every((cell) => {
      return cell === '';
    });
    if (isEmpty) {
      continue;
    }

    const debit = readAmount(cellAt(cells, map.debit));
    const credit = readAmount(cellAt(cells, map.credit));
    const balance = readAmount(cellAt(cells, map.balance));
    if (debit === undefined || credit === undefined || balance === undefined) {
      return null;
    }

    const date = cellAt(cells, map.date);
    const description = cellAt(cells, map.description);
    const rowText = cells.join(' ');
    const previous = rows[rows.length - 1];

    // Totals row: keep the numbers, it is not a transaction.
    // The label may sit in the date cell when it spans several columns ("*** Totals ***").
    if (normalizeDate(date) === null && TOTAL_WORDS.test(rowText)) {
      totals = readTotals(cells, map, debit, credit);
      continue;
    }

    // A second line of the previous description (no date, no amounts)
    if (date === '' && debit === null && credit === null && balance === null) {
      if (previous !== undefined && description !== '') {
        previous.description = `${previous.description} ${description}`.trim();
      }
      continue;
    }

    let rowDate = date;
    // Some banks print the date only on the first row of the day
    if (rowDate === '' && previous !== undefined) {
      rowDate = previous.date;
    }

    let time = cellAt(cells, map.time);
    if (time === '') {
      time = null;
    }
    let rowDescription = description;
    if (rowDescription === '') {
      rowDescription = null;
    }

    rows.push({
      date: rowDate,
      time,
      description: rowDescription,
      debit,
      credit,
      balance,
    });
  }

  return { rows, totals };
};

// Parse every statement table in the OCR text of one page
const parseStatementTables = (text) => {
  const tables = text.match(/<table[\s\S]*?<\/table>/gi);
  if (tables === null) {
    return null;
  }

  const rows = [];
  let totals = null;
  let found = false;

  for (const tableHtml of tables) {
    const tableRows = parseTable(tableHtml);
    const headerIndex = tableRows.findIndex((cells) => {
      return mapHeader(cells) !== null;
    });
    if (headerIndex === -1) {
      continue;
    }

    const body = readBody(tableRows.slice(headerIndex + 1), mapHeader(tableRows[headerIndex]));
    if (body === null) {
      return null;
    }
    found = true;
    rows.push(...body.rows);
    if (body.totals !== null) {
      totals = body.totals;
    }
  }

  if (!found) {
    return null;
  }
  return { transactions: rows, totals };
};

module.exports = { parseStatementTables };
