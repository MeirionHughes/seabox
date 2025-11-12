/**
 * manifest.js
 * Generate runtime manifest with asset metadata and extraction rules.
 */

const path = require('path');

/**
 * @typedef {Object} BinaryManifestEntry
 * @property {string} assetKey - Key in the SEA blob
 * @property {string} fileName - Original filename
 * @property {string} platform - Target platform (win32, linux, darwin, *)
 * @property {string} arch - Target architecture (x64, arm64, *)
 * @property {number} order - Extraction order priority (lower = earlier)
 * @property {string} hash - SHA-256 hash for integrity check
 */

/**
 * @typedef {Object} RuntimeManifest
 * @property {string} appName - Application name
 * @property {string} appVersion - Application version
 * @property {string} platform - Target platform
 * @property {string} arch - Target architecture
 * @property {BinaryManifestEntry[]} binaries - Binary extraction rules
 * @property {string[]} allAssetKeys - All embedded asset keys
 * @property {string} [cacheLocation] - Configured cache location (optional)
 */

/**
 * Generate a runtime manifest from scanned assets.
 * @param {import('./scanner').AssetEntry[]} assets - All scanned assets
 * @param {Object} config - SEA configuration
 * @param {string} targetPlatform - Target platform (win32, linux, darwin)
 * @param {string} targetArch - Target architecture (x64, arm64)
 * @returns {RuntimeManifest}
 */
function generateManifest(assets, config, targetPlatform, targetArch) {
  const binaries = assets
    .filter(a => a.isBinary)
    .map((asset, index) => {
      const fileName = path.basename(asset.sourcePath);
      return {
        assetKey: asset.assetKey,
        fileName,
        platform: targetPlatform,
        arch: targetArch,
        order: inferExtractionOrder(fileName, index),
        hash: asset.hash
      };
    });

  const manifest = {
    appName: config._packageName || 'app',
    appVersion: config._packageVersion || '1.0.0',
    platform: targetPlatform,
    arch: targetArch,
    binaries,
    allAssetKeys: assets.map(a => a.assetKey)
  };
  
  // Include cacheLocation if configured
  if (config.cacheLocation) {
    manifest.cacheLocation = config.cacheLocation;
  }
  
  return manifest;
}

/**
 * Infer extraction order based on file type.
 * Libraries (.dll, .so, .dylib) should extract before .node addons.
 * @param {string} fileName
 * @param {number} fallbackIndex - Fallback order if heuristic doesn't apply
 * @returns {number}
 */
function inferExtractionOrder(fileName, fallbackIndex) {
  const ext = path.extname(fileName).toLowerCase();
  
  // Extract shared libraries first
  if (['.dll', '.so', '.dylib'].includes(ext)) {
    return 10;
  }
  
  // Then native addons
  if (ext === '.node') {
    return 20;
  }

  // Fallback for other binaries
  return 100 + fallbackIndex;
}

/**
 * Serialize manifest to JSON string for embedding.
 * @param {RuntimeManifest} manifest
 * @returns {string}
 */
function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}

module.exports = {
  generateManifest,
  inferExtractionOrder,
  serializeManifest
};
