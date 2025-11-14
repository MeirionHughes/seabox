/**
 * build-cache.mjs
 * Build caching system to speed up incremental builds.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * @typedef {Object} CacheEntry
 * @property {string} hash - Content hash of input
 * @property {number} timestamp - When cached
 * @property {any} data - Cached data
 */

export class BuildCache {
  /**
   * @param {string} cacheDir - Cache directory path
   */
  constructor(cacheDir = '.seabox-cache') {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Create subdirectories
    const subdirs = ['bundles', 'natives', 'blobs'];
    for (const subdir of subdirs) {
      const dirPath = path.join(this.cacheDir, subdir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  /**
   * Compute cache key from entry path and config
   * @param {string} entryPath - Entry file path
   * @param {Object} config - Build config
   * @returns {string}
   */
  computeCacheKey(entryPath, config) {
    const configStr = JSON.stringify({
      bundler: config.bundler,
      entry: entryPath
    });
    
    return crypto
      .createHash('sha256')
      .update(configStr)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get cached bundle if valid
   * @param {string} entryPath - Entry file path
   * @param {Object} config - Build config
   * @returns {Object|null}
   */
  async getCachedBundle(entryPath, config) {
    const cacheKey = this.computeCacheKey(entryPath, config);
    const cachePath = path.join(this.cacheDir, 'bundles', `${cacheKey}.json`);

    if (!fs.existsSync(cachePath)) {
      return null;
    }

    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      
      // Validate that source files haven't changed
      if (await this.isValid(cached, entryPath)) {
        return cached;
      }
    } catch (err) {
      // Invalid cache entry
    }

    return null;
  }

  /**
   * Cache a bundle result
   * @param {string} entryPath - Entry file path
   * @param {Object} config - Build config
   * @param {Object} bundleResult - Bundle result to cache
   */
  async cacheBundle(entryPath, config, bundleResult) {
    const cacheKey = this.computeCacheKey(entryPath, config);
    const cachePath = path.join(this.cacheDir, 'bundles', `${cacheKey}.json`);

    const cacheEntry = {
      hash: await this.hashFile(entryPath),
      timestamp: Date.now(),
      data: bundleResult
    };

    fs.writeFileSync(cachePath, JSON.stringify(cacheEntry, null, 2));
  }

  /**
   * Get cached native module build
   * @param {string} moduleRoot - Module root path
   * @param {string} target - Build target
   * @returns {string|null} - Path to cached .node file
   */
  getCachedNativeBuild(moduleRoot, target) {
    const cacheKey = crypto
      .createHash('sha256')
      .update(moduleRoot + target)
      .digest('hex')
      .substring(0, 16);

    const cachePath = path.join(this.cacheDir, 'natives', `${cacheKey}.node`);

    if (fs.existsSync(cachePath)) {
      // Check if source has changed
      const bindingGypPath = path.join(moduleRoot, 'binding.gyp');
      if (fs.existsSync(bindingGypPath)) {
        const cacheStats = fs.statSync(cachePath);
        const sourceStats = fs.statSync(bindingGypPath);
        
        if (cacheStats.mtime > sourceStats.mtime) {
          return cachePath;
        }
      }
    }

    return null;
  }

  /**
   * Cache a native module build
   * @param {string} moduleRoot - Module root path
   * @param {string} target - Build target
   * @param {string} builtBinaryPath - Path to built .node file
   */
  cacheNativeBuild(moduleRoot, target, builtBinaryPath) {
    const cacheKey = crypto
      .createHash('sha256')
      .update(moduleRoot + target)
      .digest('hex')
      .substring(0, 16);

    const cachePath = path.join(this.cacheDir, 'natives', `${cacheKey}.node`);

    fs.copyFileSync(builtBinaryPath, cachePath);
  }

  /**
   * Check if cache entry is valid
   * @param {CacheEntry} cached - Cached entry
   * @param {string} filePath - Source file path
   * @returns {Promise<boolean>}
   */
  async isValid(cached, filePath) {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const currentHash = await this.hashFile(filePath);
    return currentHash === cached.hash;
  }

  /**
   * Compute hash of a file
   * @param {string} filePath - File path
   * @returns {Promise<string>}
   */
  hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Clear cache
   */
  clear() {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }
    this.ensureCacheDir();
  }
}
