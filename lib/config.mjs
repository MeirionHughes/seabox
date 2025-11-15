/**
 * config.mjs
 * Load and validate SEA configuration from seabox.config.json or package.json.
 */

import fs from 'fs';
import path from 'path';

/**
 * @typedef {Object} OutputTarget
 * @property {string} path - Output directory
 * @property {string} target - Node version and platform (e.g., node24.11.0-win32-x64)
 * @property {string} output - Executable filename
 * @property {string[]} [libraries] - Glob patterns for shared libraries (DLLs/SOs) requiring filesystem extraction
 * @property {Object} [rcedit] - Windows executable customization options
 */

/**
 * @typedef {Object} BundlerConfig
 * @property {string[]} [external] - Modules to externalize
 * @property {Array} [plugins] - Rollup plugins
 * @property {boolean} [minify] - Minify output
 * @property {boolean} [sourcemap] - Generate sourcemaps
 */

/**
 * @typedef {Object} SeaboxConfig
 * @property {string} entry - Entry point source file
 * @property {OutputTarget[]} outputs - Multi-target output configurations
 * @property {string[]} [assets] - Glob patterns for assets to embed (auto-detected assets are merged)
 * @property {BundlerConfig} [bundler] - Bundler configuration
 * @property {boolean} [encryptAssets] - Enable asset encryption
 * @property {string[]} [encryptExclude] - Assets to exclude from encryption
 * @property {boolean} [useSnapshot] - Enable V8 snapshot
 * @property {boolean} [useCodeCache] - Enable V8 code cache
 * @property {string} [cacheLocation] - Cache directory for extracted binaries
 * @property {string} [sign] - Path to signing script (.mjs/.cjs) that exports a function(config) => Promise<void>
 * @property {boolean} [verbose] - Enable verbose logging
 */

/**
 * Load SEA configuration from seabox.config.json or package.json
 * @param {string} [configPath] - Optional path to config file
 * @param {string} [projectRoot] - Project root directory
 * @returns {SeaboxConfig|null} Config object or null if not found
 */
export function loadConfig(configPath, projectRoot = process.cwd()) {
  let config;

  // Priority: CLI arg > seabox.config.json > package.json "seabox" field
  if (configPath) {
    // If explicit config path provided, it must exist
    const fullPath = path.resolve(projectRoot, configPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    config = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } else if (fs.existsSync(path.join(projectRoot, 'seabox.config.json'))) {
    // Check for seabox.config.json
    const configFile = path.join(projectRoot, 'seabox.config.json');
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } else {
    // Check for "seabox" field in package.json
    const pkgPath = path.join(projectRoot, 'package.json');
    
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      
      if (pkg.seabox) {
        config = normalizeConfig(pkg.seabox, pkg);
      } else {
        // No config found anywhere - return null
        return null;
      }
    } else {
      // No package.json - return null
      return null;
    }
  }

  validateConfig(config);
  
  return config;
}

/**
 * Normalize config from package.json to standard format
 * @param {Object} pkgConfig - Config from package.json "seabox" field
 * @param {Object} pkg - package.json contents
 * @returns {SeaboxConfig}
 */
export function normalizeConfig(pkgConfig, pkg) {
  // Helper to normalize assets to array
  const normalizeAssets = (assets) => {
    if (!assets) return [];
    if (Array.isArray(assets)) return assets;
    if (typeof assets === 'string') return [assets];
    return [];
  };

  // If already in outputs format, return as-is
  if (pkgConfig.outputs) {
    return {
      ...pkgConfig,
      assets: normalizeAssets(pkgConfig.assets),
      bundler: pkgConfig.bundler || { external: [] },
      _packageName: pkg.name,
      _packageVersion: pkg.version
    };
  }

  // Convert old targets format to outputs format
  const outputs = (pkgConfig.targets || []).map(target => ({
    path: pkgConfig.outputPath || 'dist',
    target: target,
    output: pkgConfig.output || 'app.exe',
    libraries: pkgConfig.binaries || pkgConfig.libraries,
    rcedit: pkgConfig.rcedit
  }));

  return {
    entry: pkgConfig.entry,
    outputs: outputs,
    assets: normalizeAssets(pkgConfig.assets),
    bundler: {
      external: pkgConfig.external || []
    },
    encryptAssets: pkgConfig.encryptAssets || false,
    encryptExclude: pkgConfig.encryptExclude || [],
    useSnapshot: pkgConfig.useSnapshot || false,
    useCodeCache: pkgConfig.useCodeCache || false,
    cacheLocation: pkgConfig.cacheLocation,
    verbose: pkgConfig.verbose || false,
    _packageName: pkg.name,
    _packageVersion: pkg.version
  };
}

/**
 * Validate configuration
 * @param {SeaboxConfig} config
 */
export function validateConfig(config) {
  // Required fields
  if (!config.entry) {
    throw new Error('Missing required field: entry');
  }

  if (!config.outputs || !Array.isArray(config.outputs) || config.outputs.length === 0) {
    throw new Error('Missing required field: outputs (must be non-empty array)');
  }

  // Validate each output target
  for (const output of config.outputs) {
    if (!output.path) {
      throw new Error('Output target missing required field: path');
    }
    if (!output.target) {
      throw new Error('Output target missing required field: target');
    }
    if (!output.output) {
      throw new Error('Output target missing required field: output');
    }

    // Validate target format
    const targetPattern = /^node\d+\.\d+\.\d+-\w+-\w+$/;
    if (!targetPattern.test(output.target)) {
      throw new Error(`Invalid target format: "${output.target}". Expected: nodeX.Y.Z-platform-arch`);
    }
  }
}

/**
 * Parse a target string into components
 * @param {string} target - e.g., "node24.11.0-win32-x64"
 * @returns {{nodeVersion: string, platform: string, arch: string}}
 */
export function parseTarget(target) {
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

/**
 * Get default library patterns for a platform
 * @param {string} platform - Platform name (win32, linux, darwin)
 * @returns {string[]}
 */
export function getDefaultLibraryPatterns(platform) {
  switch (platform) {
    case 'win32':
      return ['**/*.dll'];
    case 'linux':
      return ['**/*.so', '**/*.so.*'];
    case 'darwin':
      return ['**/*.dylib'];
    default:
      return [];
  }
}

/**
 * Generate default configuration
 * @param {Object} options - Options for config generation
 * @returns {SeaboxConfig}
 */
export function generateDefaultConfig(options = {}) {
  return {
    entry: options.entry || './src/index.js',
    outputs: [
      {
        path: './dist/win',
        target: 'node24.11.0-win32-x64',
        output: 'app.exe',
        libraries: ['**/*.dll']
      },
      {
        path: './dist/linux',
        target: 'node24.11.0-linux-x64',
        output: 'app',
        libraries: ['**/*.so', '**/*.so.*']
      },
      {
        path: './dist/macos',
        target: 'node24.11.0-darwin-arm64',
        output: 'app',
        libraries: ['**/*.dylib']
      }
    ],
    assets: [],
    bundler: {
      external: []
    },
    encryptAssets: false,
    useSnapshot: true
  };
}
