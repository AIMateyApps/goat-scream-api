const fs = require('fs');
const path = require('path');
const { warn: logWarn } = require('./logger');

let cache = null;
let source = 'mock-data/sample-screams.js';

function loadFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error('static screams file must export an array');
  }
  return data;
}

function loadStaticScreams() {
  if (cache) return cache;

  const dataPath = path.resolve(__dirname, '../../data/screams-public.json');
  if (fs.existsSync(dataPath)) {
    try {
      cache = loadFromFile(dataPath);
      source = 'data/screams-public.json';
      return cache;
    } catch (err) {
      logWarn('Failed to read static screams file, falling back to mock dataset', {
        path: dataPath,
        error: err.message,
      });
    }
  }

  cache = require('../../mock-data/sample-screams');
  source = 'mock-data/sample-screams.js';
  return cache;
}

function getStaticScreams() {
  return loadStaticScreams();
}

function reloadStaticScreams() {
  cache = null;
  return loadStaticScreams();
}

function getStaticSource() {
  loadStaticScreams();
  return source;
}

module.exports = {
  getStaticScreams,
  reloadStaticScreams,
  getStaticSource,
};
