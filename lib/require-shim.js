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
  // Check if this is a .node file
  if (typeof id === 'string' && id.endsWith('.node')) {
    // Check if we're in SEA mode
    let isSEA = false;
    const sea = __originalRequire('node:sea');
    isSEA = sea.isSea();

    
    if (isSEA && global.__seaNativeModuleMap) {
      const path = __originalRequire('path');
      const basename = path.basename(id);
      const nameWithoutExt = path.basename(id, '.node');
      
      const resolvedPath = global.__seaNativeModuleMap[basename] || 
                          global.__seaNativeModuleMap[nameWithoutExt] ||
                          global.__seaNativeModuleMap[id];
      
      if (resolvedPath) {
        const module = { exports: {} };
        process.dlopen(module, resolvedPath);
        return module.exports;
      } else {
        console.error('[__requireSeabox] ✗ Module not found in native module map');
        console.error('[__requireSeabox] Requested:', id);
        console.error('[__requireSeabox] Available:', Object.keys(global.__seaNativeModuleMap));
      }
    }
  }
  
  // Handle bindings module
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
