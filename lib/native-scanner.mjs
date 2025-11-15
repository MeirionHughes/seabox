/**
 * native-scanner.mjs
 * Deep scanning of node_modules for native modules and automatic detection.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import * as diag from './diagnostics.mjs';

/**
 * @typedef {Object} NativeModuleMetadata
 * @property {string} name - Module name
 * @property {string} path - Absolute path to module root
 * @property {string} version - Module version
 * @property {boolean} hasBindingGyp - Whether binding.gyp exists
 * @property {string[]} binaryFiles - Detected .node files
 */

/**
 * Scan node_modules directory for native modules
 * @param {string} projectRoot - Project root directory
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<NativeModuleMetadata[]>}
 */
export async function scanDependenciesForNativeModules(projectRoot, verbose = false) {
  const nativeModules = [];
  const nodeModulesPath = path.join(projectRoot, 'node_modules');

  if (!fsSync.existsSync(nodeModulesPath)) {
    diag.verbose('No node_modules directory found');
    return [];
  }

  diag.verbose('Scanning node_modules for native modules');

  /**
   * Recursively scan a directory for packages
   */
  async function scanDir(dir, isScoped = false) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden directories and bin
        if (entry.name.startsWith('.') || entry.name === '.bin') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const pkgPath = path.join(fullPath, 'package.json');

          // Check if this is a scoped package directory
          if (entry.name.startsWith('@')) {
            await scanDir(fullPath, true);
            continue;
          }

          // Check if package.json exists
          if (fsSync.existsSync(pkgPath)) {
            const moduleInfo = await analyzePackage(fullPath, pkgPath);
            if (moduleInfo) {
              nativeModules.push(moduleInfo);
            }
          }
        }
      }
    } catch (err) {
      diag.verbose(`Error scanning directory: ${dir} - ${err.message}`);
    }
  }

  /**
   * Analyze a package to determine if it's a native module
   */
  async function analyzePackage(modulePath, pkgPath) {
    try {
      const pkgContent = await fs.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgContent);

      // Check for native module indicators
      const hasBindingGyp = fsSync.existsSync(path.join(modulePath, 'binding.gyp'));
      const hasGypfile = pkg.gypfile === true;
      const hasBinaryField = pkg.binary != null;

      if (!hasBindingGyp && !hasGypfile && !hasBinaryField) {
        return null;
      }

      // Find .node files
      const binaryFiles = await findNodeFiles(modulePath);

      if (hasBindingGyp || hasGypfile || binaryFiles.length > 0) {
        return {
          name: pkg.name,
          path: modulePath,
          version: pkg.version,
          hasBindingGyp: hasBindingGyp,
          binaryFiles: binaryFiles
        };
      }

      return null;
    } catch (err) {
      // Ignore packages with invalid package.json
      return null;
    }
  }

  /**
   * Find all .node files in a directory tree
   */
  async function findNodeFiles(dir, maxDepth = 5, currentDepth = 0) {
    const nodeFiles = [];

    if (currentDepth > maxDepth) {
      return nodeFiles;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules subdirectories
          if (entry.name === 'node_modules') {
            continue;
          }

          // Recurse into subdirectories
          const subFiles = await findNodeFiles(fullPath, maxDepth, currentDepth + 1);
          nodeFiles.push(...subFiles);
        } else if (entry.name.endsWith('.node')) {
          nodeFiles.push(fullPath);
        }
      }
    } catch (err) {
      // Ignore read errors
    }

    return nodeFiles;
  }

  await scanDir(nodeModulesPath);

  diag.verbose(`Found ${nativeModules.length} native modules`);
  for (const mod of nativeModules) {
    diag.verbose(`- ${mod.name}@${mod.version} (${mod.binaryFiles.length} binaries)`, 1);
  }

  return nativeModules;
}

/**
 * Find the build output path for a native module
 * @param {string} moduleRoot - Root directory of the native module
 * @param {string} target - Build target (e.g., node24.11.0-win32-x64)
 * @returns {Promise<string|null>}
 */
export async function findNativeModuleBuildPath(moduleRoot, target) {
  const { platform, arch } = parseTarget(target);
  
  // Common build output locations
  const searchPaths = [
    path.join(moduleRoot, 'build/Release'),
    path.join(moduleRoot, 'build/Debug'),
    path.join(moduleRoot, 'lib/binding', `${platform}-${arch}`),
    path.join(moduleRoot, 'prebuilds', `${platform}-${arch}`)
  ];

  for (const searchPath of searchPaths) {
    if (fsSync.existsSync(searchPath)) {
      // Look for .node files
      const files = await fs.readdir(searchPath);
      const nodeFile = files.find(f => f.endsWith('.node'));
      
      if (nodeFile) {
        return path.join(searchPath, nodeFile);
      }
    }
  }

  return null;
}

/**
 * Parse a target string into components
 */
function parseTarget(target) {
  const match = target.match(/^node(\d+\.\d+\.\d+)-(\w+)-(\w+)$/);
  if (!match) {
    throw new Error(`Cannot parse target: ${target}`);
  }
  return {
    nodeVersion: match[1],
    platform: match[2],
    arch: match[3]
  };
}
