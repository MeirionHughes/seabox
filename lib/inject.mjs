/**
 * inject.mjs
 * Inject SEA blob into Node binary using postject.
 */

import fs from 'fs';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';
import * as diag from './diagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import unsign using require since it's CommonJS
const require = Module.createRequire(import.meta.url);
const { removeSignature, setVerbose: setUnsignVerbose } = require('./unsign.cjs');

/**
 * Inject a SEA blob into a Node.js binary using postject.
 * @param {string} nodeBinaryPath - Path to the source Node binary
 * @param {string} blobPath - Path to the SEA blob file
 * @param {string} outputPath - Path for the output executable
 * @param {string} platform - Target platform (win32, linux, darwin)
 * @param {boolean} verbose - Enable verbose logging
 * @param {Object} [rceditOptions] - Optional rcedit configuration for Windows executables
 * @returns {Promise<void>}
 */
export async function injectBlob(nodeBinaryPath, blobPath, outputPath, platform, verbose, rceditOptions) {
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Copy node binary to output location
  fs.copyFileSync(nodeBinaryPath, outputPath);

  // Remove existing signature before postject injection
  setUnsignVerbose(verbose);
  await removeSignature(outputPath, platform);

  // Apply rcedit changes (Windows only, before postject)
  if (platform === 'win32' && rceditOptions && typeof rceditOptions === 'object') {
    await applyRcedit(outputPath, rceditOptions, verbose);
  }

  // Prepare postject command
  const sentinel = 'NODE_SEA_BLOB';
  const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

  diag.verbose(`Injecting SEA blob into: ${outputPath}`, 1);
  
  // Use postject programmatically
  const postject = (await import('postject')).default;
  
  // Read blob data as buffer
  const blobData = fs.readFileSync(blobPath);
  
  const injectOptions = {
    sentinelFuse,
    machoSegmentName: platform === 'darwin' ? 'NODE_SEA' : undefined
  };

  try {
    await postject.inject(outputPath, sentinel, blobData, injectOptions);
    diag.verbose('SEA blob injected successfully', 2);
  } catch (error) {
    throw new Error(`Postject injection failed: ${error.message}`);
  }
}

/**
 * Apply rcedit to modify Windows executable resources.
 * @param {string} exePath - Path to the executable
 * @param {Object} options - rcedit options (icon, version-string, file-version, product-version, etc.)
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<void>}
 */
async function applyRcedit(exePath, options, verbose) {
  diag.verbose('Applying rcedit to modify executable resources...', 2);
  diag.verbose(`Options: ${JSON.stringify(options, null, 2)}`, 2);

  // Dynamic import for rcedit (it's CommonJS)
  const rcedit = (await import('rcedit')).default;
  
  try {
    await rcedit(exePath, options);
    diag.verbose('rcedit applied successfully', 2);
  } catch (error) {
    throw new Error(`rcedit failed: ${error.message}`);
  }
}

export { applyRcedit };
