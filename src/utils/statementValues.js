// Turn dates and amounts as written on a statement into clean values.
// Done in code, not by the model, so Buddhist years and number formats are converted the same way every time.

const THAI_MONTHS = {
  'ม.ค.': 1, มกราคม: 1, 'ก.พ.': 2, กุมภาพันธ์: 2, 'มี.ค.': 3, มีนาคม: 3,
  'เม.ย.': 4, เมษายน: 4, 'พ.ค.': 5, พฤษภาคม: 5, 'มิ.ย.': 6, มิถุนายน: 6,
  'ก.ค.': 7, กรกฎาคม: 7, 'ส.ค.': 8, สิงหาคม: 8, 'ก.ย.': 9, กันยายน: 9,
  'ต.ค.': 10, ตุลาคม: 10, 'พ.ย.': 11, พฤศจิกายน: 11, 'ธ.ค.': 12, ธันวาคม: 12,
};

const ENGLISH_MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const BUDDHIST_OFFSET = 543;

// 2569 -> 2026. Two-digit years pick the reading closest to this year: "69" -> 2026 (BE), "26" -> 2026.
const toGregorianYear = (year) => {
  if (year >= 2400) {
    return year - BUDDHIST_OFFSET;
  }
  if (year >= 100) {
    return year;
  }

  const currentYear = new Date().getFullYear();
  const gregorian = 2000 + year;
  const buddhist = 2500 + year - BUDDHIST_OFFSET;
  if (Math.abs(buddhist - currentYear) < Math.abs(gregorian - currentYear)) {
    return buddhist;
  }
  return gregorian;
};

const pad = (value) => {
  return String(value).padStart(2, '0');
};

const buildDate = (year, month, day) => {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const fullYear = toGregorianYear(year);
  // Reject impossible dates such as 31/02
  const check = new Date(Date.UTC(fullYear, month - 1, day));
  if (check.getUTCMonth() !== month - 1) {
    return null;
  }
  return `${fullYear}-${pad(month)}-${pad(day)}`;
};

const monthFromName = (name) => {
  const cleaned = name.trim();
  if (THAI_MONTHS[cleaned] !== undefined) {
    return THAI_MONTHS[cleaned];
  }
  // Allow Thai abbreviations written without the last dot, e.g. "ต.ค"
  if (THAI_MONTHS[`${cleaned}.`] !== undefined) {
    return THAI_MONTHS[`${cleaned}.`];
  }
  const english = ENGLISH_MONTHS[cleaned.slice(0, 3).toLowerCase()];
  if (english !== undefined) {
    return english;
  }
  return null;
};

// "31/10/2569", "31-10-26", "31.10.2026", "2026-10-31", "31 ต.ค. 69", "31 Oct 2026" -> "2026-10-31"
// Numeric dates are read as day/month/year, the format used by Thai banks.
const normalizeDate = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return buildDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (match) {
    return buildDate(Number(match[3]), Number(match[2]), Number(match[1]));
  }

  match = text.match(/^(\d{1,2})\s*([^\d\s]+)\s*(\d{2}|\d{4})\b/);
  if (match) {
    const month = monthFromName(match[2]);
    if (month === null) {
      return null;
    }
    return buildDate(Number(match[3]), month, Number(match[1]));
  }

  return null;
};

// "1,250.00" -> 1250, "(500.00)" -> -500, "-500" -> -500, "฿ 99.50 บาท" -> 99.5. Numbers pass through.
const normalizeAmount = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return value;
  }

  let text = value.trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/[,\s฿]|บาท|THB/gi, '');
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) {
    // Leave it as it is; schema validation will ask the model to fix it
    return value;
  }

  const number = Number(text);
  if (negative) {
    return -number;
  }
  return number;
};

module.exports = { normalizeDate, normalizeAmount };
