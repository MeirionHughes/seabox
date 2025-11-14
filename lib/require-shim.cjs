/**
 * require-shim.js
 * SEA-aware require replacement that intercepts .node module loads
 */

/**
 * Generate the __requireSeabox shim code
 * @returns {string} - The shim code to inject
 */
function generateRequireShim() {
  return `
// SEA-aware require replacement
const __originalRequire = require;
function __requireSeabox(id) {
  // Check if this is a native module request (either .node extension or asset key)
  if (typeof id === 'string' && (id.endsWith('.node') || id.startsWith('native/'))) {
    // Check if we're in SEA mode
    let isSEA = false;
    try {
      const sea = __originalRequire('node:sea');
      isSEA = sea.isSea();
    } catch (e) {
      // Not in SEA mode
    }
    
    if (isSEA && global.__seaNativeModuleMap) {
      const path = __originalRequire('path');
      
      // Try multiple resolution strategies
      const basename = path.basename(id);
      const nameWithoutExt = basename.replace(/\\.node$/, '');
      
      // 1. Try the ID as-is (asset key)
      let resolvedPath = global.__seaNativeModuleMap[id];
      
      // 2. Try basename
      if (!resolvedPath) {
        resolvedPath = global.__seaNativeModuleMap[basename];
      }
      
      // 3. Try name without extension
      if (!resolvedPath) {
        resolvedPath = global.__seaNativeModuleMap[nameWithoutExt];
      }
      
      // 4. Try searching for matching keys
      if (!resolvedPath) {
        for (const [key, value] of Object.entries(global.__seaNativeModuleMap)) {
          if (key.endsWith(basename) || key.endsWith(nameWithoutExt)) {
            resolvedPath = value;
            break;
          }
        }
      }
      
      if (resolvedPath) {
        const module = { exports: {} };
        process.dlopen(module, resolvedPath);
        return module.exports;
      } else {
        console.error('[__requireSeabox] ✗ Native module not found in map');
        console.error('[__requireSeabox] Requested:', id);
        console.error('[__requireSeabox] Available:', Object.keys(global.__seaNativeModuleMap));
      }
    }
  }
  
  // Handle bindings module - return a shim that uses our native module map
  if (id === 'bindings') {
    return function(name) {
      if (!name.endsWith('.node')) {
        name += '.node';
      }
      return __requireSeabox(name);
    };
  }
  
  // Fall back to original require
  return __originalRequire(id);
}
`;
}

/**
 * Replace all require() calls with __requireSeabox() in source code
 * @param {string} sourceCode - The source code to transform
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} - { code: string, count: number }
 */
function replaceRequireCalls(sourceCode, verbose = false) {
  if (verbose) console.log('Replacing require() calls with __requireSeabox()');
  
  const requirePattern = /\brequire\s*\(/g;
  let replacementCount = 0;
  
  const transformedCode = sourceCode.replace(requirePattern, (match) => {
    replacementCount++;
    return '__requireSeabox(';
  });
  
  if (verbose) console.log('Replaced ' + replacementCount + ' require() calls');
  
  return {
    code: transformedCode,
    count: replacementCount
  };
}

module.exports = {
  generateRequireShim,
  replaceRequireCalls
};
