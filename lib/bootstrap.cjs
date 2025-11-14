/**
 * bootstrap.js
 * Runtime template for SEA applications.
 * Handles binary extraction and module resolution override.
 * 
 * This file is prepended to the application entry bundle.
 */

(function () {
  'use strict';

  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const Module = require('module');

  // PHASE 1: Override fs methods IMMEDIATELY (before app code captures them)
  // We'll populate the redirect maps in Phase 2 after extraction
  const assetPathMapGlobal = {};
  let cacheDirGlobal = '';

  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalStatSync = fs.statSync;
  const originalLstatSync = fs.lstatSync;
  const originalRealpathSync = fs.realpathSync;

  /**
   * Check if a requested path should be redirected to cache.
   * @param {string} requestedPath
   * @returns {string|null} - Redirected path or null
   */
  function getRedirectedPath(requestedPath) {
    if (!requestedPath) return null;

    // Normalize the requested path
    const normalized = path.normalize(requestedPath);

    // Check direct match against asset keys
    for (const [assetKey, extractedPath] of Object.entries(assetPathMapGlobal)) {
      // Try exact match
      if (normalized.endsWith(assetKey)) {
        return extractedPath;
      }

      // Try basename match
      const assetBasename = path.basename(assetKey);
      if (path.basename(normalized) === assetBasename) {
        return extractedPath;
      }

      // Try matching the path components
      if (normalized.includes(assetKey.replace(/\//g, path.sep))) {
        return extractedPath;
      }
    }

    return null;
  }

  // Override existsSync immediately
  fs.existsSync = function (filePath) {
    if (!filePath) return originalExistsSync(filePath);

    // If this path should be redirected, check if the REDIRECTED path exists
    const redirected = getRedirectedPath(filePath);
    if (redirected) {
      return originalExistsSync(redirected);
    }

    // For .node files, ONLY allow cache paths for our managed binaries
    if (filePath.endsWith('.node') && cacheDirGlobal) {
      const basename = path.basename(filePath);

      // Check if this is one of our managed binaries
      for (const assetKey of Object.keys(assetPathMapGlobal)) {
        if (path.basename(assetKey) === basename) {
          // This is one of our binaries
          // Only return true if the path is in the cache directory
          if (filePath.startsWith(cacheDirGlobal)) {
            return originalExistsSync(filePath);
          } else {
            // Block all non-cache paths for our binaries
            return false;
          }
        }
      }
    }

    return originalExistsSync(filePath);
  };

  //  Override readFileSync immediately
  fs.readFileSync = function (filePath, options) {
    const redirected = getRedirectedPath(filePath);
    if (redirected) {
      return originalReadFileSync(redirected, options);
    }
    return originalReadFileSync(filePath, options);
  };

  // Override statSync immediately
  fs.statSync = function (filePath, options) {
    const redirected = getRedirectedPath(filePath);
    if (redirected) {
      return originalStatSync(redirected, options);
    }
    return originalStatSync(filePath, options);
  };

  // Override lstatSync immediately
  fs.lstatSync = function (filePath, options) {
    const redirected = getRedirectedPath(filePath);
    if (redirected) {
      return originalLstatSync(redirected, options);
    }
    return originalLstatSync(filePath, options);
  };

  // Override realpathSync immediately
  fs.realpathSync = function (filePath, options) {
    const redirected = getRedirectedPath(filePath);
    if (redirected) {
      return redirected; // Return the redirected path as the "real" path
    }
    return originalRealpathSync(filePath, options);
  };

  // SEA API - check if we're in an SEA by trying to load the sea module
  let sea = null;
  let isSEA = false;
  try {
    sea = require('node:sea');
    isSEA = true;
  } catch (err) {
    // Not in SEA context - this is fine for development
  }

  /**
   * Decrypt an encrypted asset.
   * @param {Buffer} encryptedData - Encrypted data with IV and auth tag prepended
   * @param {Buffer} key - 32-byte encryption key
   * @returns {Buffer} - Decrypted data
   */
  function decryptAsset(encryptedData, key) {
    // Extract IV, auth tag, and encrypted content
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const encrypted = encryptedData.slice(32);

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted;
  }

  /**
   * Get an asset from the SEA, decrypting if necessary.
   * @param {string} assetKey - Asset key
   * @param {string} [encoding] - Optional encoding (e.g., 'utf8')
   * @returns {Buffer|string} - Asset content
   */
  function getAsset(assetKey, encoding) {
    if (!sea) {
      throw new Error('Cannot get asset: not in SEA context');
    }

    // Check if this asset is encrypted
    const isEncrypted = typeof SEA_ENCRYPTED_ASSETS !== 'undefined' && SEA_ENCRYPTED_ASSETS.has(assetKey);

    let content;
    if (isEncrypted && typeof SEA_ENCRYPTION_KEY !== 'undefined') {
      // Get raw encrypted data
      const encryptedData = sea.getRawAsset(assetKey);
      const buffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);

      // Decrypt it
      content = decryptAsset(buffer, SEA_ENCRYPTION_KEY);
    } else {
      // Get unencrypted asset
      content = sea.getAsset(assetKey, encoding);
      if (!encoding && !Buffer.isBuffer(content)) {
        content = Buffer.from(content);
      }
    }

    // Apply encoding if requested
    if (encoding && Buffer.isBuffer(content)) {
      return content.toString(encoding);
    }

    return content;
  }


  /**
   * Resolve environment variables in a path string.
   * Supports %VAR% on Windows and $VAR or ${VAR} on Unix-like systems.
   * @param {string} pathStr - Path string that may contain environment variables
   * @returns {string} - Path with environment variables expanded
   */
  function resolveEnvVars(pathStr) {
    if (!pathStr) return pathStr;

    // Replace Windows-style %VAR%
    let resolved = pathStr.replace(/%([^%]+)%/g, (match, varName) => {
      return process.env[varName] || match;
    });

    // Replace Unix-style $VAR and ${VAR}
    resolved = resolved.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
    resolved = resolved.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, varName) => {
      return process.env[varName] || match;
    });

    return resolved;
  }

  /**
   * Get the extraction cache directory for this application.
   * @param {string} appName
   * @param {string} appVersion
   * @param {string} platform
   * @param {string} arch
   * @param {string} [configuredCacheLocation] - Optional configured cache location from manifest
   * @returns {string}
   */
  function getExtractionCacheDir(appName, appVersion, platform, arch, configuredCacheLocation) {
    // Priority: SEACACHE env var > configured location > default
    if (process.env.SEACACHE) return process.env.SEACACHE;

    if (configuredCacheLocation) {
      // Resolve environment variables in the configured path
      const resolvedBase = resolveEnvVars(configuredCacheLocation);
      // Make relative paths absolute (relative to cwd)
      const absoluteBase = path.isAbsolute(resolvedBase) ? resolvedBase : path.resolve(process.cwd(), resolvedBase);
      return path.join(absoluteBase, appName, `${appVersion}-${platform}-${arch}`);
    }

    // Default behavior
    const localAppData = process.env.LOCALAPPDATA || process.env.HOME || process.cwd();
    return path.join(localAppData, '.sea-cache', appName, `${appVersion}-${platform}-${arch}`);
  }

  /**
   * Extract a binary asset to the cache directory.
   * @param {string} assetKey
   * @param {string} targetPath
   * @param {string} expectedHash
   * @returns {boolean} - True if extracted or already valid
   */
  function extractBinary(assetKey, targetPath, expectedHash) {
    // Check if already extracted and valid
    if (fs.existsSync(targetPath)) {
      const existingHash = hashFile(targetPath);
      if (existingHash === expectedHash) {
        return true; // Already valid
      }
      // Hash mismatch, re-extract
      fs.unlinkSync(targetPath);
    }

    // Extract from SEA blob (binaries are never encrypted)
    const assetBuffer = sea.getRawAsset(assetKey);
    if (!assetBuffer) {
      throw new Error(`Asset not found in SEA blob: ${assetKey}`);
    }

    // Convert ArrayBuffer to Buffer if needed
    const buffer = Buffer.isBuffer(assetBuffer)
      ? assetBuffer
      : Buffer.from(assetBuffer);

    // Verify hash before writing
    const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (actualHash !== expectedHash) {
      throw new Error(`Integrity check failed for ${assetKey}: expected ${expectedHash}, got ${actualHash}`);
    }

    // Write to cache
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, buffer);

    // Set executable permissions on Unix-like systems
    if (process.platform !== 'win32') {
      fs.chmodSync(targetPath, 0o755);
    }

    return true;
  }

  /**
   * Compute SHA-256 hash of a file.
   * @param {string} filePath
   * @returns {string}
   */
  function hashFile(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Override fs module methods to intercept file access for extracted binaries.
   * This provides a generic solution that works with any native module loading pattern
   * (bindings package, direct require, etc.)
   * @param {string} cacheDir - Cache directory where binaries are extracted
   * @param {Object.<string, string>} assetPathMap - Map of asset key -> extracted path
   */
  /**
   * Override Module._resolveFilename and Module._load to redirect native module loads to extracted cache.
   * @param {Object.<string, string>} nativeModuleMap - Map of module name -> extracted path
   */
  function overrideModuleResolution(nativeModuleMap) {
    const originalResolveFilename = Module._resolveFilename;
    const originalLoad = Module._load;

    // Override _resolveFilename for normal resolution
    Module._resolveFilename = function (request, parent, isMain, options) {
      // Normalize the request path
      const normalized = path.normalize(request);

      // Check direct match
      if (nativeModuleMap[request]) {
        return nativeModuleMap[request];
      }

      // Check for basename match
      const basename = path.basename(request);
      if (nativeModuleMap[basename]) {
        return nativeModuleMap[basename];
      }

      // Check if the request includes any of our native modules
      for (const [moduleName, extractedPath] of Object.entries(nativeModuleMap)) {
        if (request.endsWith(moduleName) || request.includes(moduleName) ||
          normalized.includes(moduleName.replace(/\//g, path.sep))) {
          return extractedPath;
        }
      }

      // Fall back to original resolution
      return originalResolveFilename.call(this, request, parent, isMain, options);
    };

    // Override _load to intercept at load time (catches SEA embedderRequire)
    Module._load = function (request, parent, isMain) {
      // Normalize the request path
      const normalized = path.normalize(request);

      // Check direct match
      if (nativeModuleMap[request]) {
        return originalLoad.call(this, nativeModuleMap[request], parent, isMain);
      }

      // Check for basename match
      const basename = path.basename(request);
      if (nativeModuleMap[basename]) {
        return originalLoad.call(this, nativeModuleMap[basename], parent, isMain);
      }

      // Check if the request includes any of our native modules
      for (const [moduleName, extractedPath] of Object.entries(nativeModuleMap)) {
        if (request.endsWith(moduleName) || request.includes(moduleName) ||
          normalized.includes(moduleName.replace(/\//g, path.sep))) {
          return originalLoad.call(this, extractedPath, parent, isMain);
        }
      }

      // Fall back to original load
      return originalLoad.call(this, request, parent, isMain);
    };
  }

  /**
   * Bootstrap the SEA application.
   * Extracts binaries and sets up module resolution.
   */
  function bootstrap() {
    if (!sea) {
      throw new Error('This script must run in a SEA (Single Executable Application) context');
    }

    // Patch sea.getAsset to handle decryption transparently
    if (typeof SEA_ENCRYPTED_ASSETS !== 'undefined' && typeof SEA_ENCRYPTION_KEY !== 'undefined') {
      const originalGetAsset = sea.getAsset.bind(sea);
      const originalGetRawAsset = sea.getRawAsset.bind(sea);

      sea.getAsset = function (assetKey, encoding) {
        const isEncrypted = SEA_ENCRYPTED_ASSETS.has(assetKey);

        if (isEncrypted) {
          // Get raw encrypted data
          const encryptedData = originalGetRawAsset(assetKey);
          const buffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);

          // Decrypt it
          const decrypted = decryptAsset(buffer, SEA_ENCRYPTION_KEY);

          // Apply encoding if requested
          if (encoding) {
            return decrypted.toString(encoding);
          }
          return decrypted;
        } else {
          // Not encrypted, use original method
          return originalGetAsset(assetKey, encoding);
        }
      };
    }

    // Load the manifest from SEA assets (manifest is never encrypted)
    const manifestJson = sea.getAsset('sea-manifest.json', 'utf8');
    if (!manifestJson) {
      throw new Error('SEA manifest not found in blob');
    }

    const manifest = JSON.parse(manifestJson);
    const verbose = process.env.SEA_VERBOSE === 'true';

    if (verbose) {
      console.log('=== SEA Bootstrap START ===');
      console.log('SEA Bootstrap:');
      console.log(`  App: ${manifest.appName} v${manifest.appVersion}`);
      console.log(`  Platform: ${manifest.platform}-${manifest.arch}`);
      console.log(`  Binaries in manifest: ${manifest.binaries.length}`);
      console.log(`  All manifest binaries:`, manifest.binaries.map(b => b.fileName));
      if (manifest.cacheLocation) {
        console.log(`  Configured cache location: ${manifest.cacheLocation}`);
      }
    }

    // Filter binaries for current platform
    const platformBinaries = manifest.binaries.filter(b =>
      (b.platform === '*' || b.platform === process.platform) &&
      (b.arch === '*' || b.arch === process.arch)
    );

    // Sort by extraction order
    platformBinaries.sort((a, b) => a.order - b.order);

    const cacheDir = getExtractionCacheDir(
      manifest.appName,
      manifest.appVersion,
      manifest.platform,
      manifest.arch,
      manifest.cacheLocation
    );

    const nativeModuleMap = {};

    // Extract binaries
    for (const binary of platformBinaries) {
      const targetPath = path.join(cacheDir, binary.fileName);

      if (verbose) {
        console.log(`  Extracting: ${binary.assetKey} -> ${targetPath}`);
      }

      extractBinary(binary.assetKey, targetPath, binary.hash);

      // Map the module name to extracted path
      nativeModuleMap[binary.fileName] = targetPath;

      // Also map without extension for easier resolution
      const nameWithoutExt = path.basename(binary.fileName, path.extname(binary.fileName));
      nativeModuleMap[nameWithoutExt] = targetPath;
      
      // PHASE 2: Populate global asset map for fs overrides
      assetPathMapGlobal[binary.assetKey] = targetPath;
    }

    // PHASE 2: Set global cache directory
    cacheDirGlobal = cacheDir;

    if (verbose) {
      console.log('✓ Binary extraction complete');
      console.log(`  Cache directory: ${cacheDir}`);
      console.log(`  Asset mappings: ${Object.keys(assetPathMapGlobal).length}`);
    }

    // On Windows, add the cache directory to DLL search path
    if (process.platform === 'win32') {
      // Add to PATH so that native addons can find dependent DLLs
      process.env.PATH = `${cacheDir};${process.env.PATH}`;

      if (verbose) {
        console.log(`  Added to PATH: ${cacheDir}`);
      }

      // Also try to add DLL directory using SetDllDirectory (if available)
      try {
        // Windows-specific: preload all DLLs to ensure they're in the process
        platformBinaries
          .filter(b => b.fileName.endsWith('.dll'))
          .forEach(b => {
            const dllPath = path.join(cacheDir, b.fileName);
            if (verbose) {
              console.log(`  Preloading DLL: ${dllPath}`);
            }
            // Use process.dlopen to preload the DLL
            try {
              process.dlopen({ exports: {} }, dllPath);
            } catch (err) {
              // DLL might not be a valid node addon, which is fine
              if (verbose) {
                console.log(`    (Non-addon DLL, will be loaded by OS loader)`);
              }
            }
          });
      } catch (err) {
        if (verbose) {
          console.warn('Warning: Could not preload DLLs:', err.message);
        }
      }
    }

    // Set environment variable for cache directory (used by applications)
    process.env.SEA_CACHE_DIR = cacheDir;

    // Export native module map and cache dir to global for require override in app code
    global.__seaNativeModuleMap = nativeModuleMap;
    global.__seaCacheDir = cacheDir;

    // Add cache directory to module paths so bindings can find extracted .node files
    if (!Module.globalPaths.includes(cacheDir)) {
      Module.globalPaths.unshift(cacheDir);
    }

  // Override module resolution
  overrideModuleResolution(nativeModuleMap);

    // Provide a 'bindings' module shim for SEA compatibility
    // This gets injected into the module cache so require('bindings') works
    const bindingsShim = function (name) {
      // Ensure .node extension
      if (!name.endsWith('.node')) {
        name += '.node';
      }

      if (verbose) {
        console.log(`[bindings shim] Loading native module: ${name}`);
      }

      // Try to load from native module map
      if (nativeModuleMap[name]) {
        const exports = {};
        process.dlopen({ exports }, nativeModuleMap[name]);
        return exports;
      }

      // Try basename without .node
      const baseName = path.basename(name, '.node');
      if (nativeModuleMap[baseName]) {
        const exports = {};
        process.dlopen({ exports }, nativeModuleMap[baseName]);
        return exports;
      }

      throw new Error(`Could not load native module "${name}" - not found in SEA cache`);
    };

    // Inject bindings into module cache
    Module._cache['bindings'] = {
      id: 'bindings',
      exports: bindingsShim,
      loaded: true
    };

    if (verbose) {
      console.log('[SEA] Injected bindings shim into module cache');
    }
  }

  /**
   * Set up the .node extension handler to lazy-load native modules
   * This needs to run during snapshot build so it's baked into the snapshot
   */
  function setupNodeExtensionHandler() {
    const Module = require('module');
    const originalResolveFilename = Module._resolveFilename;
    const originalNodeHandler = Module._extensions['.node'];

    // CRITICAL: Override Module._resolveFilename FIRST to intercept path resolution
    // This catches requires BEFORE they try to load, including snapshot requires
    Module._resolveFilename = function (request, parent, isMain, options) {
      // Only intercept .node files
      if (request.endsWith('.node')) {
        const basename = path.basename(request);
        const nameWithoutExt = path.basename(request, '.node');

        if (global.__seaNativeModuleMap) {
          const resolvedPath = global.__seaNativeModuleMap[basename] ||
            global.__seaNativeModuleMap[nameWithoutExt] ||
            global.__seaNativeModuleMap[request];

          if (resolvedPath) {
            return resolvedPath;
          }
        }
      }

      // Fall back to original resolution
      return originalResolveFilename.call(this, request, parent, isMain, options);
    };

    // Override the .node extension handler
    // During snapshot: creates a lazy-loading placeholder
    // During runtime: loads from the cache using populated globals
    Module._extensions['.node'] = function (module, filename) {
      const basename = path.basename(filename);
      const nameWithoutExt = path.basename(filename, '.node');

      // Check if we have the native module map (only available after bootstrap at runtime)
      if (global.__seaNativeModuleMap) {
        const resolvedPath = global.__seaNativeModuleMap[basename] ||
          global.__seaNativeModuleMap[nameWithoutExt];

        if (resolvedPath) {
          process.dlopen(module, resolvedPath);
          return;
        }
      }

      // If we get here, we're during snapshot creation or the module wasn't found
      // During snapshot creation, we create a lazy-loading proxy
      const moduleKey = basename;

      // Create a lazy-loading exports object
      // When any property is accessed, it will try to load the real module
      const lazyExports = {};
      let realModuleLoaded = false;
      let realExports = null;

      // Use defineProperty to intercept all property access
      const handler = {
        get(target, prop) {
          // If we haven't loaded the real module yet, try now
          if (!realModuleLoaded) {
            if (global.__seaNativeModuleMap) {
              const resolvedPath = global.__seaNativeModuleMap[moduleKey] ||
                global.__seaNativeModuleMap[nameWithoutExt];

              if (resolvedPath) {
                const tempModule = { exports: {} };
                process.dlopen(tempModule, resolvedPath);
                realExports = tempModule.exports;
                realModuleLoaded = true;

                // Copy all properties to the lazy exports
                Object.assign(lazyExports, realExports);

                return realExports[prop];
              } else {
                throw new Error(`Native module ${moduleKey} not found in SEA cache`);
              }
            } else {
              throw new Error(`Native module loading attempted before bootstrap completed: ${moduleKey}`);
            }
          }

          return realExports[prop];
        },

        set(target, prop, value) {
          if (realExports) {
            realExports[prop] = value;
          } else {
            lazyExports[prop] = value;
          }
          return true;
        },

        has(target, prop) {
          if (realExports) {
            return prop in realExports;
          }
          return prop in lazyExports;
        },

        ownKeys(target) {
          if (realExports) {
            return Object.keys(realExports);
          }
          return Object.keys(lazyExports);
        },

        getOwnPropertyDescriptor(target, prop) {
          if (realExports) {
            return Object.getOwnPropertyDescriptor(realExports, prop);
          }
          return Object.getOwnPropertyDescriptor(lazyExports, prop);
        }
      };

      module.exports = new Proxy(lazyExports, handler);
    };
  }

  // Run bootstrap if in SEA context
  if (isSEA && sea) {
    // Check if we're building a snapshot
    let isBuildingSnapshot = false;
    try {
      const v8 = require('v8');
      isBuildingSnapshot = v8.startupSnapshot && v8.startupSnapshot.isBuildingSnapshot && v8.startupSnapshot.isBuildingSnapshot();
    } catch (err) {
      // v8.startupSnapshot not available
    }

    if (isBuildingSnapshot) {
      setupNodeExtensionHandler();

      // During snapshot build: set up callback to run bootstrap at runtime
      const v8 = require('v8');
      const originalCallback = v8.startupSnapshot.setDeserializeMainFunction;

      // Intercept setDeserializeMainFunction to add bootstrap before app code
      v8.startupSnapshot.setDeserializeMainFunction = function (callback) {
        originalCallback.call(this, () => {
          // Run bootstrap to extract binaries and populate globals
          bootstrap();

          // Then run the application callback
          callback();
        });
      };
    } else {
      // Normal runtime: run bootstrap immediately
      bootstrap();
    }
  }

})(); // End bootstrap IIFE

// Export for testing (only accessible if loaded as module)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Empty exports - bootstrap runs automatically
  };
}
