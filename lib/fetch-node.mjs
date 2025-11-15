/**
 * fetch-node.mjs
 * Download target Node.js binary for SEA injection.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { pipeline } from 'stream';
import { promisify } from 'util';
import AdmZip from 'adm-zip';
import tar from 'tar';
import * as diag from './diagnostics.mjs';

const pipelineAsync = promisify(pipeline);

/**
 * Construct the Node.js download URL for a given target.
 * @param {string} nodeVersion - e.g., "24.11.0"
 * @param {string} platform - e.g., "win", "linux", "darwin"
 * @param {string} arch - e.g., "x64", "arm64"
 * @returns {string}
 */
function getNodeDownloadUrl(nodeVersion, platform, arch) {
  const baseUrl = 'https://nodejs.org/dist';
  
  // Map platform names to Node.js naming
  const platformMap = {
    win32: 'win',
    linux: 'linux',
    darwin: 'darwin'
  };
  
  const mappedPlatform = platformMap[platform] || platform;
  
  // Construct filename
  let filename;
  if (mappedPlatform === 'win') {
    filename = `node-v${nodeVersion}-${mappedPlatform}-${arch}.zip`;
  } else {
    filename = `node-v${nodeVersion}-${mappedPlatform}-${arch}.tar.gz`;
  }
  
  return `${baseUrl}/v${nodeVersion}/${filename}`;
}

/**
 * Download a file from a URL to a local path.
 * @param {string} url
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        return downloadFile(response.headers.location, outputPath)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }

      const file = fs.createWriteStream(outputPath);
      pipelineAsync(response, file)
        .then(resolve)
        .catch(reject);
    }).on('error', reject);
  });
}

/**
 * Extract node.exe or node binary from downloaded archive.
 * @param {string} archivePath - Path to .zip or .tar.gz
 * @param {string} outputDir - Directory to extract to
 * @param {string} platform - Platform identifier
 * @returns {Promise<string>} - Path to extracted node binary
 */
async function extractNodeBinary(archivePath, outputDir, platform) {
  if (platform === 'win32') {
    // Extract from ZIP
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(outputDir, true);
    
    // Find node.exe in the extracted directory structure
    const extracted = fs.readdirSync(outputDir);
    for (const item of extracted) {
      const itemPath = path.join(outputDir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        const nodeExePath = path.join(itemPath, 'node.exe');
        if (fs.existsSync(nodeExePath)) {
          const finalPath = path.join(outputDir, 'node.exe');
          fs.renameSync(nodeExePath, finalPath);
          // Clean up extracted directory
          fs.rmSync(itemPath, { recursive: true, force: true });
          return finalPath;
        }
      }
    }
    
    throw new Error('node.exe not found in archive');
  } else {
    // Extract from tar.gz
    await tar.extract({
      file: archivePath,
      cwd: outputDir,
      filter: (p) => p.endsWith('/bin/node')
    });

    // Find the extracted node binary
    const extracted = fs.readdirSync(outputDir);
    for (const dir of extracted) {
      const nodePath = path.join(outputDir, dir, 'bin', 'node');
      if (fs.existsSync(nodePath)) {
        const finalPath = path.join(outputDir, 'node');
        fs.renameSync(nodePath, finalPath);
        fs.chmodSync(finalPath, 0o755);
        return finalPath;
      }
    }

    throw new Error('node binary not found in archive');
  }
}

/**
 * Fetch and prepare a Node.js binary for SEA injection.
 * @param {string} nodeVersion
 * @param {string} platform
 * @param {string} arch
 * @param {string} cacheDir - Directory to cache downloads
 * @returns {Promise<string>} - Path to the node binary
 */
export async function fetchNodeBinary(nodeVersion, platform, arch, cacheDir) {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const binaryName = platform === 'win32' ? 'node.exe' : 'node';
  const cachedBinary = path.join(cacheDir, `${nodeVersion}-${platform}-${arch}`, binaryName);

  // Check cache
  if (fs.existsSync(cachedBinary)) {
    diag.verbose(`Using cached Node binary: ${cachedBinary}`, 1);
    return cachedBinary;
  }

  diag.verbose(`Downloading Node.js v${nodeVersion} for ${platform}-${arch}...`, 1);
  const url = getNodeDownloadUrl(nodeVersion, platform, arch);
  const archiveName = path.basename(url);
  const archivePath = path.join(cacheDir, archiveName);

  await downloadFile(url, archivePath);
  diag.verbose(`Downloaded: ${archivePath}`, 1);

  const extractDir = path.join(cacheDir, `${nodeVersion}-${platform}-${arch}`);
  fs.mkdirSync(extractDir, { recursive: true });

  const binaryPath = await extractNodeBinary(archivePath, extractDir, platform);
  diag.verbose(`Extracted Node binary: ${binaryPath}`, 1);

  // Clean up archive
  fs.unlinkSync(archivePath);

  return binaryPath;
}

export { getNodeDownloadUrl, downloadFile, extractNodeBinary };
