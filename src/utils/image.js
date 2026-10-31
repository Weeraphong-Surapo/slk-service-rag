const { createCanvas, loadImage } = require('@napi-rs/canvas');
const AppError = require('./AppError');

// Small images are enlarged at most this many times; more only adds blur
const MAX_UPSCALE = 3;

// Resize an image so its longest side is maxDimension and return a PNG buffer.
// Small images are enlarged too: Typhoon OCR invented table values on a 900px image
// and read it correctly at 1800px.
// Transparent areas become white so the OCR model sees dark text on a light background.
const toOcrPng = async (buffer, maxDimension) => {
  let image;
  try {
    image = await loadImage(buffer);
  } catch (err) {
    throw new AppError('The file is not a valid image', 400);
  }

  const longestSide = Math.max(image.width, image.height);
  const scale = Math.min(MAX_UPSCALE, maxDimension / longestSide);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.encode('png');
};

module.exports = { toOcrPng };
