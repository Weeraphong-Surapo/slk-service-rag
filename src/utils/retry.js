const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

// Run fn until it succeeds. Used at startup while MySQL/Qdrant are still booting.
const retry = async (name, fn, { attempts = 20, delayMs = 3000 } = {}) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === attempts) {
        throw err;
      }
      console.log(`${name} not ready (${err.message}), retry ${attempt}/${attempts}...`);
      await sleep(delayMs);
    }
  }
  return undefined;
};

module.exports = retry;
