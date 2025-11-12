/**
 * scanner.js
 * Resolve glob patterns, collect assets, and identify binary artifacts.
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const crypto = require('crypto');

/**
 * @typedef {Object} AssetEntry
 * @property {string} sourcePath - Absolute path to the asset on disk
 * @property {string} assetKey - Logical key in the SEA blob
 * @property {boolean} isBinary - True if this is a binary artifact requiring extraction
 * @property {string} [hash] - SHA-256 hash of the file
 */

/**
 * Scan and resolve all assets from configuration.
 * Supports negative glob patterns (prefixed with '!') for exclusions.
 * @param {string[]} assetPatterns - Glob patterns from config (supports '!' prefix for exclusions)
 * @param {string[]} [binaryPatterns] - Patterns identifying binaries to extract
 * @param {string[]} [excludePatterns] - Legacy: Additional patterns to exclude (optional)
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<AssetEntry[]>}
 */
async function scanAssets(assetPatterns, binaryPatterns = [], excludePatterns = [], projectRoot = process.cwd()) {
  const assets = [];
  const seenKeys = new Set();

  // Separate positive and negative patterns
  const includePatterns = [];
  const negativePatterns = [];
  
  for (const pattern of assetPatterns) {
    if (pattern.startsWith('!')) {
      // Negative pattern - add to exclusions (remove the '!' prefix)
      negativePatterns.push(pattern.slice(1));
    } else {
      includePatterns.push(pattern);
    }
  }

  // Combine negative patterns with legacy excludePatterns
  const allExclusions = [...negativePatterns, ...excludePatterns];

  // Process each include pattern
  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: projectRoot,
      nodir: true,
      absolute: false,
      ignore: allExclusions
    });

    for (const match of matches) {
      const sourcePath = path.resolve(projectRoot, match);
      const assetKey = normalizeAssetKey(match);

      // Skip duplicates
      if (seenKeys.has(assetKey)) {
        continue;
      }
      seenKeys.add(assetKey);

      const isBinary = isBinaryAsset(match, binaryPatterns);
      const hash = isBinary ? await computeHash(sourcePath) : undefined;

      assets.push({
        sourcePath,
        assetKey,
        isBinary,
        hash
      });
    }
  }

  return assets;
}

/**
 * Normalize a file path to a forward-slash asset key.
 * @param {string} filePath
 * @returns {string}
 */
function normalizeAssetKey(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Check if an asset matches binary patterns.
 * @param {string} filePath
 * @param {string[]} binaryPatterns
 * @returns {boolean}
 */
function isBinaryAsset(filePath, binaryPatterns) {
  const ext = path.extname(filePath).toLowerCase();
  const binaryExtensions = ['.node', '.dll', '.so', '.dylib'];

  // Check explicit patterns first
  for (const pattern of binaryPatterns) {
    if (filePath.includes(pattern) || filePath.endsWith(pattern)) {
      return true;
    }
  }

  // Fall back to extension check
  return binaryExtensions.includes(ext);
}

/**
 * Compute SHA-256 hash of a file.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
function computeHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Group assets by binary vs non-binary.
 * @param {AssetEntry[]} assets
 * @returns {{binaries: AssetEntry[], nonBinaries: AssetEntry[]}}
 */
function groupAssets(assets) {
  const binaries = [];
  const nonBinaries = [];

  for (const asset of assets) {
    if (asset.isBinary) {
      binaries.push(asset);
    } else {
      nonBinaries.push(asset);
    }
  }

  return { binaries, nonBinaries };
}

module.exports = {
  scanAssets,
  normalizeAssetKey,
  isBinaryAsset,
  computeHash,
  groupAssets
};
