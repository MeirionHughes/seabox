/**
 * index.js
 * Main entry point for seabox
 */

const { build } = require('./build');
const { loadConfig, parseTarget } = require('./config');
const { scanAssets, groupAssets } = require('./scanner');
const { generateManifest, serializeManifest } = require('./manifest');
const { createSeaConfig, writeSeaConfigJson, generateBlob } = require('./blob');
const { fetchNodeBinary } = require('./fetch-node');
const { injectBlob } = require('./inject');

module.exports = {
  build,
  loadConfig,
  parseTarget,
  scanAssets,
  groupAssets,
  generateManifest,
  serializeManifest,
  createSeaConfig,
  writeSeaConfigJson,
  generateBlob,
  fetchNodeBinary,
  injectBlob
};
