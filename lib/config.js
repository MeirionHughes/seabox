/**
 * config.js
 * Load and validate SEA configuration from package.json or standalone config file.
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} SeaConfig
 * @property {string} entry - Path to the bundled application entry script
 * @property {string[]} assets - Array of glob patterns or paths to include in SEA blob (supports '!' prefix for exclusions)
 * @property {string[]} targets - Array of target specifiers (e.g., "node24.11.0-win-x64")
 * @property {string} output - Output executable filename
 * @property {string} outputPath - Directory for the final executable
 * @property {string[]} [binaries] - Array of binary filename patterns to extract at runtime
 * @property {boolean} [disableExperimentalSEAWarning] - Suppress SEA experimental warning
 * @property {boolean} [useSnapshot] - Enable V8 snapshot
 * @property {boolean} [useCodeCache] - Enable V8 code cache
 * @property {string[]} [exclude] - (Legacy) Glob patterns to exclude from assets - use '!' prefix in assets instead
 * @property {boolean} [encryptAssets] - Enable asset encryption (default: false)
 * @property {string[]} [encryptExclude] - Asset patterns to exclude from encryption
 * @property {boolean} [rebuild] - Automatically rebuild native modules for target platform (default: false)
 * @property {boolean} [verbose] - Enable diagnostic logging
 * @property {string} [cacheLocation] - Cache directory for extracted binaries (default: ''%LOCALAPPDATA%/.sea-cache', supports env vars like '%LOCALAPPDATA%\\path')
 * @property {Object} [rcedit] - Windows executable resource editor options (icon, version info, etc.)
 */

/**
 * Load SEA configuration from package.json or a standalone file.
 * @param {string} [configPath] - Optional path to a standalone config file
 * @param {string} [projectRoot] - Project root directory (defaults to cwd)
 * @returns {SeaConfig}
 */
function loadConfig(configPath, projectRoot = process.cwd()) {
  let config;

  if (configPath) {
    // Load from standalone config file
    const fullPath = path.resolve(projectRoot, configPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    config = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } else {
    // Load from package.json
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      throw new Error(`package.json not found in: ${projectRoot}`);
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    // Check for 'sea' field first, fall back to 'pkg' for migration compatibility
    config = pkg.seabox || pkg.pkg;
    
    if (!config) {
      throw new Error('No "seabox" or "pkg" configuration found in package.json');
    }

    // Attach package metadata for manifest
    config._packageName = pkg.name;
    config._packageVersion = pkg.version;
  }

  validateConfig(config);
  return config;
}

/**
 * Validate required configuration fields.
 * @param {SeaConfig} config
 */
function validateConfig(config) {
  const required = ['entry', 'assets', 'targets', 'output', 'outputPath'];
  const missing = required.filter(field => !config[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required SEA config fields: ${missing.join(', ')}`);
  }

  if (!Array.isArray(config.assets) || config.assets.length === 0) {
    throw new Error('SEA config "assets" must be a non-empty array');
  }

  if (!Array.isArray(config.targets) || config.targets.length === 0) {
    throw new Error('SEA config "targets" must be a non-empty array');
  }

  // Validate target format (e.g., "node24.11.0-win-x64")
  const targetPattern = /^node\d+\.\d+\.\d+-\w+-\w+$/;
  config.targets.forEach(target => {
    if (!targetPattern.test(target)) {
      throw new Error(`Invalid target format: "${target}". Expected format: "nodeX.Y.Z-platform-arch"`);
    }
  });
}

/**
 * Parse a target string into components.
 * @param {string} target - e.g., "node24.11.0-win-x64"
 * @returns {{nodeVersion: string, platform: string, arch: string}}
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

module.exports = {
  loadConfig,
  validateConfig,
  parseTarget
};
