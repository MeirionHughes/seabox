/**
 * blob.mjs
 * Create SEA configuration JSON and prepare blob for injection.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as diag from './diagnostics.mjs';

const execFileAsync = promisify(execFile);

/**
 * @typedef {Object} SeaBlobConfig
 * @property {string} main - Path to the entry script
 * @property {string} output - Output blob filename
 * @property {boolean} disableExperimentalSEAWarning - Suppress SEA warning
 * @property {boolean} useSnapshot - Enable V8 snapshot
 * @property {boolean} useCodeCache - Enable V8 code cache
 * @property {Object.<string, string|Buffer>} assets - Asset key -> content map
 */

/**
 * Create the SEA configuration object for Node.js SEA tooling.
 * @param {string} entryScript - Path to the bundled entry script
 * @param {string} outputBlob - Output blob filename
 * @param {Array} assets - All assets to embed
 * @param {Object} config - SEA configuration
 * @returns {SeaBlobConfig}
 */
export function createSeaConfig(entryScript, outputBlob, assets, config) {
  const seaConfig = {
    main: entryScript,
    output: outputBlob,
    disableExperimentalSEAWarning: config.disableExperimentalSEAWarning ?? true,
    useSnapshot: config.useSnapshot ?? false,
    useCodeCache: config.useCodeCache ?? false,
    assets: {}
  };

  // Add all assets as key -> buffer mappings
  for (const asset of assets) {
    // Handle inline content (e.g., manifest) vs file-based assets
    const content = asset.content 
      ? asset.content 
      : fs.readFileSync(asset.sourcePath);
    seaConfig.assets[asset.assetKey] = content;
  }

  return seaConfig;
}

/**
 * Write the SEA configuration to a JSON file.
 * This config file is consumed by `node --experimental-sea-config`.
 * @param {SeaBlobConfig} seaConfig
 * @param {string} outputPath - Path to write the config JSON
 * @param {Array} assets - Original asset entries
 * @param {string} tempDir - Temporary directory for inline assets
 */
export function writeSeaConfigJson(seaConfig, outputPath, assets, tempDir) {
  // Node's SEA config expects asset values to be file paths (raw assets)
  const jsonConfig = {
    main: seaConfig.main,
    output: seaConfig.output,
    disableExperimentalSEAWarning: seaConfig.disableExperimentalSEAWarning,
    useSnapshot: seaConfig.useSnapshot,
    useCodeCache: seaConfig.useCodeCache,
    assets: {}
  };

  // Map asset keys to file paths
  for (const asset of assets) {
    if (asset.content) {
      // Inline content (e.g., manifest) - write to temp file
      const tempFilePath = path.join(tempDir, asset.assetKey.replace(/\//g, '_'));
      fs.mkdirSync(path.dirname(tempFilePath), { recursive: true });
      fs.writeFileSync(tempFilePath, asset.content);
      jsonConfig.assets[asset.assetKey] = tempFilePath;
    } else {
      // File-based asset - use source path
      jsonConfig.assets[asset.assetKey] = asset.sourcePath;
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(jsonConfig, null, 2), 'utf8');
}

/**
 * Generate the SEA blob using Node.js CLI.
 * Executes: node --experimental-sea-config sea-config.json
 * @param {string} seaConfigPath - Path to the SEA config JSON
 * @param {string} nodeBinary - Path to the Node.js binary to use
 * @returns {Promise<void>}
 */
export async function generateBlob(seaConfigPath, nodeBinary = process.execPath) {
  try {
    await execFileAsync(nodeBinary, ['--experimental-sea-config', seaConfigPath]);
    diag.verbose('SEA blob generated successfully', 2);
  } catch (error) {
    throw new Error(`Failed to generate SEA blob: ${error.message}`);
  }
}
