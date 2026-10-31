// Split text into overlapping chunks.
// Character-based, because Thai text often has no spaces between words.
// Tries to cut at a paragraph, line or space near the end of each chunk.

const SEPARATORS = ['\n\n', '\n', ' '];

const normalize = (text) => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Find the best cut position between the middle and the end of the window
const findBreak = (text, start, end) => {
  const minPosition = start + Math.floor((end - start) / 2);

  for (const separator of SEPARATORS) {
    const index = text.lastIndexOf(separator, end);
    if (index >= minPosition) {
      return index + separator.length;
    }
  }

  return end;
};

const splitText = (text, chunkSize, chunkOverlap) => {
  const clean = normalize(text);
  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      end = findBreak(clean, start, end);
    }

    const piece = clean.slice(start, end).trim();
    if (piece.length > 0) {
      chunks.push(piece);
    }

    if (end >= clean.length) {
      break;
    }

    // Step back by the overlap, but always move forward
    start = Math.max(end - chunkOverlap, start + 1);
  }

  return chunks;
};

module.exports = { splitText };
