/**
 * rolldown-bundler.mjs
 * Automatic bundling with Rollup and native module detection.
 * Replaces manual bundling step with integrated solution.
 */

import fs from 'fs';
import path from 'path';
import { rolldown  as rolldown } from 'rolldown';
import Module from 'module';
import { fileURLToPath } from 'url';
import * as diag from './diagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} NativeModuleInfo
 * @property {string} binaryPath - Path to the .node file
 * @property {string} packageRoot - Root directory of the native module package
 * @property {string} moduleName - Name of the module
 * @property {string} buildPath - Path to build directory (e.g., build/Release)
 */

/**
 * Rollup plugin to detect and transform native module patterns.
 * Based on rollup-plugin-natives approach - transforms at build time.
 * Also detects path.join(__dirname, ...) asset references for auto-embedding.
 */
class NativeModuleDetectorPlugin {
  constructor(options = {}) {
    /** @type {Map<string, NativeModuleInfo>} */
    this.nativeModules = new Map();
    /** @type {Set<string>} */
    this.detectedAssets = new Set();
    this.targetPlatform = options.targetPlatform || process.platform;
    this.targetArch = options.targetArch || process.arch;
    this.projectRoot = options.projectRoot || process.cwd();
  }

  name = 'native-module-detector';

  /**
   * Get module root (package.json directory) for a given file
   */
  getModuleRoot(id) {
    let moduleRoot = path.dirname(id);
    let prev = null;
    
    while (true) {
      if (moduleRoot === '.') {
        moduleRoot = process.cwd();
      }

      if (fs.existsSync(path.join(moduleRoot, 'package.json')) ||
          fs.existsSync(path.join(moduleRoot, 'node_modules'))) {
        break;
      }

      if (prev === moduleRoot) break;

      prev = moduleRoot;
      moduleRoot = path.resolve(moduleRoot, '..');
    }

    return moduleRoot;
  }

  /**
   * Register a native module
   */
  registerNativeModule(nativePath, isPrebuild = false) {
    if (this.nativeModules.has(nativePath)) {
      return this.nativeModules.get(nativePath);
    }

    const packageRoot = this.findPackageRoot(nativePath);
    const moduleName = packageRoot ? path.basename(packageRoot) : path.basename(nativePath, '.node');
    
    // Use relative path from project root to avoid conflicts and preserve structure
    const relativeFromProject = path.relative(this.projectRoot, nativePath).replace(/\\/g, '/');
    
    const info = {
      binaryPath: nativePath,
      packageRoot: packageRoot || path.dirname(nativePath),
      moduleName: moduleName,
      buildPath: path.dirname(nativePath),
      assetKey: relativeFromProject,
      isPrebuild: isPrebuild  // Track if this is a prebuild (don't rebuild)
    };

    this.nativeModules.set(nativePath, info);
    return info;
  }

  /**
   * Transform hook - detect and replace native module patterns
   */
  transform = (code, id) => {
    let hasChanges = false;
    let transformedCode = code;

    // Detect path.join(__dirname, 'relative/path') patterns for auto-embedding assets
    this.detectDirnameAssets(code, id);

    // Pattern 1: require('bindings')('module_name')
    const bindingsPattern = /require\(['"]bindings['"]\)\(((['"])(.+?)\2)?\)/g;
    const moduleRoot = this.getModuleRoot(id);
    const self = this;
    
    transformedCode = transformedCode.replace(bindingsPattern, function(match, args, quote, name) {
      const nativeAlias = name || 'bindings.node';
      const nodeName = nativeAlias.endsWith('.node') ? nativeAlias : `${nativeAlias}.node`;

      // Try standard build locations
      const possibilities = [
        path.join(moduleRoot, 'build', nodeName),
        path.join(moduleRoot, 'build', 'Debug', nodeName),
        path.join(moduleRoot, 'build', 'Release', nodeName),
      ];

      const chosenPath = possibilities.find(p => fs.existsSync(p));
      if (chosenPath) {
        const info = self.registerNativeModule(chosenPath);
        hasChanges = true;
        return `__requireSeabox('${info.assetKey}')`;
      }

      return match;
    });

    // Pattern 2: Direct require('./path.node') or require('./path')
    const directRequirePattern = /require\(['"]([^'"]+)['"]\)/g;
    transformedCode = transformedCode.replace(directRequirePattern, function(match, modulePath) {
      // Only process potential native module paths
      if (!modulePath.includes('.node') && !modulePath.includes('/build/')) {
        return match;
      }

      let testPath = modulePath;
      if (!testPath.endsWith('.node')) {
        testPath += '.node';
      }

      // Resolve relative to the current file
      if (modulePath.startsWith('.')) {
        testPath = path.resolve(path.dirname(id), testPath);
      } else {
        testPath = path.join(moduleRoot, testPath);
      }

      if (fs.existsSync(testPath)) {
        const info = self.registerNativeModule(testPath);
        hasChanges = true;
        return `__requireSeabox('${info.assetKey}')`;
      }

      return match;
    });

    // Pattern 3: node-gyp-build pattern - needs runtime platform detection
    if (code.includes('node-gyp-build')) {
      const nodeGypBuildPattern = /require\(['"]node-gyp-build['"]\)\(__dirname\)/g;
      transformedCode = transformedCode.replace(nodeGypBuildPattern, function(match) {
        const prebuildsDir = path.join(moduleRoot, 'prebuilds');
        
        // For node-gyp-build, we need to handle it differently since it's platform-specific
        // Check if we're building for a specific platform or current platform
        if (fs.existsSync(prebuildsDir)) {
          const platformArchDir = path.join(prebuildsDir, `${self.targetPlatform}-${self.targetArch}`);
          
          if (fs.existsSync(platformArchDir)) {
            const files = fs.readdirSync(platformArchDir);
            const nodeFiles = files.filter(f => f.endsWith('.node'));
            
            if (nodeFiles.length > 0) {
              // Pick best match (prefer napi builds)
              const napiFile = nodeFiles.find(f => f.includes('napi')) || nodeFiles[0];
              const nativePath = path.join(platformArchDir, napiFile);
              const info = self.registerNativeModule(nativePath, true);  // Mark as prebuild
              hasChanges = true;
              return `__requireSeabox('${info.assetKey}')`;
            }
          }
        }
        
        // If prebuilds don't exist, fall back to build/Release for gyp builds
        const buildRelease = path.join(moduleRoot, 'build', 'Release');
        if (fs.existsSync(buildRelease)) {
          const files = fs.readdirSync(buildRelease);
          const nodeFile = files.find(f => f.endsWith('.node'));
          if (nodeFile) {
            const nativePath = path.join(buildRelease, nodeFile);
            const info = self.registerNativeModule(nativePath);
            hasChanges = true;
            return `__requireSeabox('${info.assetKey}')`;
          }
        }

        return match;
      });
    }

    // Pattern 4: node-pre-gyp pattern (strip it out and use direct path)
    if (code.includes('node-pre-gyp') || code.includes('@mapbox/node-pre-gyp')) {
      const preGypPattern = /(?:var|let|const)\s+(\w+)\s+=\s+require\(['"](?:@mapbox\/)?node-pre-gyp['"]\)/g;
      const varMatch = preGypPattern.exec(code);
      
      if (varMatch) {
        const varName = varMatch[1];
        const binaryPattern = new RegExp(
          `(?:var|let|const)\\s+(\\w+)\\s+=\\s+${varName}\\.find\\(path\\.resolve\\(path\\.join\\(__dirname,\\s*(['"])(.+?)\\2\\)\\)\\);?\\s*(?:var|let|const)\\s+(\\w+)\\s+=\\s+require\\(\\1\\)`,
          'g'
        );
        
        transformedCode = transformedCode.replace(binaryPattern, function(match, pathVar, quote, relPath) {
          // Try to find the actual binary using standard node-pre-gyp structure
          const possibilities = [
            path.join(moduleRoot, 'lib', 'binding'),
            path.join(moduleRoot, 'build', 'Release')
          ];

          for (const dir of possibilities) {
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir);
              const nodeFile = files.find(f => f.endsWith('.node'));
              if (nodeFile) {
                const nativePath = path.join(dir, nodeFile);
                const info = self.registerNativeModule(nativePath);
                hasChanges = true;
                // Remove the pre-gyp require entirely
                transformedCode = transformedCode.replace(varMatch[0], '');
                const requireVarMatch = match.match(/const\s+(\w+)\s+=\s+require/);
                const requireVar = requireVarMatch ? requireVarMatch[1] : 'binding';
                return `const ${pathVar} = '${info.assetKey}'; const ${requireVar} = __requireSeabox('${info.assetKey}')`;
              }
            }
          }

          return match;
        });
      }
    }

    return hasChanges ? { code: transformedCode, map: null } : null;
  }

  /**
   * Detect path.join(__dirname, ...) patterns and register them as assets
   */
  detectDirnameAssets(code, id) {
    // Match: path.join(__dirname, 'relative/path') or path.join(__dirname, '..', 'path')
    // Also: path.resolve(__dirname, ...) patterns
    const pathJoinPattern = /path\.(?:join|resolve)\s*\(\s*__dirname\s*,\s*(.+?)\)/g;
    
    let match;
    while ((match = pathJoinPattern.exec(code)) !== null) {
      try {
        // Extract the path arguments - they could be literals or variables
        const args = match[1];
        
        // Try to extract string literals (simple case)
        const literalPattern = /['"]([^'"]+)['"]/g;
        const literals = [];
        let literalMatch;
        while ((literalMatch = literalPattern.exec(args)) !== null) {
          literals.push(literalMatch[1]);
        }
        
        if (literals.length > 0) {
          // Construct the relative path
          const relativePath = path.join(...literals);
          
          // Resolve from the file's directory
          const fileDir = path.dirname(id);
          const absolutePath = path.resolve(fileDir, relativePath);
          
          // Make it relative to project root for the asset key
          const relativeToProject = path.relative(this.projectRoot, absolutePath);
          
          // Only register if the file exists
          if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
            // Normalize path separators for asset key
            const assetKey = relativeToProject.replace(/\\/g, '/');
            this.detectedAssets.add(assetKey);
          }
        }
      } catch (err) {
        // Ignore parse errors - some patterns might be too complex
      }
    }
  }

  /**
   * Find the package root containing binding.gyp
   */
  findPackageRoot(filePath) {
    let current = path.dirname(filePath);
    const root = path.parse(current).root;

    while (current !== root) {
      const pkgPath = path.join(current, 'package.json');
      
      if (fs.existsSync(pkgPath)) {
        // Check if this package has native bindings
        const hasBindingGyp = fs.existsSync(path.join(current, 'binding.gyp'));
        
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (hasBindingGyp || pkg.gypfile === true) {
            return current;
          }
        } catch (err) {
          // Ignore JSON parse errors
        }
      }

      current = path.dirname(current);
    }

    return null;
  }

  /**
   * Get all detected native modules
   */
  getNativeModules() {
    return this.nativeModules;
  }

  /**
   * Get all detected assets from path.join(__dirname, ...) patterns
   */
  getDetectedAssets() {
    return this.detectedAssets;
  }
}

/**
 * Bundle application with Rollup and detect native modules
 * @param {string} entryPath - Absolute path to entry file
 * @param {string} outputPath - Path for bundled output
 * @param {Object} config - Build configuration
 * @param {string} targetPlatform - Target platform
 * @param {string} targetArch - Target architecture
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<{bundledPath: string, nativeModules: Map<string, NativeModuleInfo>, detectedAssets: Set<string>}>}
 */
export async function bundleWithRollup(entryPath, outputPath, config = {}, targetPlatform = process.platform, targetArch = process.arch, verbose = false) {
  const projectRoot = config._projectRoot || process.cwd();
  
  const nativeDetector = new NativeModuleDetectorPlugin({
    targetPlatform,
    targetArch,
    projectRoot
  });
  
  diag.verbose(`Bundling entry: ${entryPath}`);
  diag.verbose(`Target: ${diag.formatTarget(targetPlatform, targetArch)}`);

  // Get Node.js built-in modules to mark as external
  const builtinModules = Module.builtinModules || [];

  const bundle = await rolldown({
    input: entryPath,
    platform: "node",
    plugins: [
      nativeDetector,   
      ...(config.bundler?.plugins || [])
    ],
    external: [
      // Node built-ins are always external
      ...builtinModules,
      // User-specified externals (filter out functions for Rolldown compatibility)
      ...(config.bundler?.external || []).filter(e => typeof e !== 'function'),
      // Match .node files with regex instead of function
      /\.node$/
    ],
    onwarn: (warning, warn) => {
      // Suppress certain warnings
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      if (warning.code === 'EVAL') return;
      
      if (verbose) {
        warn(warning);
      }
    }
  });

  await bundle.write({
    file: outputPath,
    format: 'cjs',
    exports: 'auto',
    banner: '/* Bundled by Seabox */\n',
    sourcemap: config.bundler?.sourcemap || false
  });

  await bundle.close();

  diag.verbose(`Bundle complete: ${outputPath}`);
  diag.verbose(`Native modules detected: ${nativeDetector.nativeModules.size}`);
  diag.verbose(`Assets detected: ${nativeDetector.detectedAssets.size}`);

  return {
    bundledPath: outputPath,
    nativeModules: nativeDetector.getNativeModules(),
    detectedAssets: nativeDetector.getDetectedAssets()
  };
}

export { NativeModuleDetectorPlugin };
