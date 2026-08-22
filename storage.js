const fs = require('node:fs');
const path = require('node:path');

function dataDir() {
  return process.env.DATA_DIR || path.join(__dirname, 'data');
}

function ensureDataDir() {
  fs.mkdirSync(dataDir(), { recursive: true });
  return dataDir();
}

function dataFile(name) {
  return path.join(ensureDataDir(), name);
}

module.exports = {
  dataDir,
  ensureDataDir,
  dataFile,
};
