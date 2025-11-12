/**
 * bindings.js - SEA-compatible replacement for the 'bindings' npm package
 * This version uses process.dlopen to load native modules from the SEA cache
 */

const path = require('path');

module.exports = function bindings(name) {
  // Ensure .node extension
  if (!name.endsWith('.node')) {
    name += '.node';
  }
  
  // Get cache directory from environment
  const cacheDir = process.env.SEA_CACHE_DIR;
  if (!cacheDir) {
    throw new Error('SEA_CACHE_DIR not set - bindings shim requires SEA context');
  }
  
  // Construct path to native module in cache
  const binaryPath = path.join(cacheDir, name);
  
  // Load using process.dlopen
  const exports = {};
  try {
    process.dlopen({ exports }, binaryPath);
    return exports;
  } catch (err) {
    throw new Error(`Could not load native module "${name}" from SEA cache: ${err.message}`);
  }
};
