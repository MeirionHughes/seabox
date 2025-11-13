/**
 * entry-bundler.js
 * Bundles the entry file with bootstrap and require shim
 */

const { generateRequireShim, replaceRequireCalls } = require('./require-shim');

/**
 * Bundle the entry file for SEA
 * @param {string} entryContent - The entry file content
 * @param {string} augmentedBootstrap - The bootstrap code
 * @param {boolean} useSnapshot - Whether to use snapshot mode
 * @param {boolean} verbose - Enable verbose logging
 * @returns {string} - The bundled entry content
 */
function bundleEntry(entryContent, augmentedBootstrap, useSnapshot, verbose) {
  // Generate the require shim and replace require() calls
  const requireSeaboxShim = generateRequireShim();
  const transformed = replaceRequireCalls(entryContent, verbose);
  const transformedContent = transformed.code;
  
  let bundledEntry;
  
  if (useSnapshot) {
    // Snapshot mode: Bootstrap intercepts setDeserializeMainFunction and will run before app code
    const parts = [
      augmentedBootstrap,
      '\n\n',
      requireSeaboxShim,
      '\n\n',
      '// Application entry - will be wrapped by bootstrap\'s setDeserializeMainFunction interceptor\n',
      '(function() {\n',
      '  const v8 = __originalRequire(\'v8\');\n',
      '  if (v8.startupSnapshot && v8.startupSnapshot.isBuildingSnapshot()) {\n',
      '    // Bootstrap has already intercepted setDeserializeMainFunction\n',
      '    // This call will be caught by the bootstrap interceptor\n',
      '    v8.startupSnapshot.setDeserializeMainFunction(() => {\n',
      '      // Provide CommonJS globals if the bundler expects them\n',
      '      if (typeof exports === \'undefined\') {\n',
      '        var exports = {};\n',
      '        var module = { exports: exports };\n',
      '      }\n',
      '      // Run the application code\n',
      transformedContent,
      '\n',
      '    });\n',
      '  } else {\n',
      '    // Not building snapshot, run normally\n',
      transformedContent,
      '\n',
      '  }\n',
      '})();\n'
    ];
    bundledEntry = parts.join('');
  } else {
    // Non-snapshot mode: just prepend bootstrap and shim
    bundledEntry = augmentedBootstrap + '\n\n' + requireSeaboxShim + '\n' + transformedContent;
  }
  
  return bundledEntry;
}

module.exports = {
  bundleEntry
};
