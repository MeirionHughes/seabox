/**
 * entry-bundler.mjs
 * Bundles the entry file with bootstrap and require shim
 */

import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const require = Module.createRequire(import.meta.url);

const { generateRequireShim, replaceRequireCalls } = require('./require-shim.mjs');

/**
 * Bundle the entry file for SEA
 * @param {string} entryContent - The entry file content
 * @param {string} augmentedBootstrap - The bootstrap code
 * @param {boolean} useSnapshot - Whether to use snapshot mode
 * @param {boolean} verbose - Enable verbose logging
 * @returns {string} - The bundled entry content
 */
export function bundleEntry(entryContent, augmentedBootstrap, useSnapshot, verbose) {
  // Generate the require shim and replace require() calls
  const requireSeaboxShim = generateRequireShim();
  const transformed = replaceRequireCalls(entryContent, verbose);
  const transformedContent = transformed.code;
  
  let bundledEntry;
  
  if (useSnapshot) {
    // Snapshot mode
    const parts = [
      augmentedBootstrap,
      '\n\n',
      requireSeaboxShim,
      '\n\n',
      '// Application entry - will be wrapped by bootstrap\'s setDeserializeMainFunction interceptor\n',
      '(function() {\n',
      '  const v8 = __originalRequire(\'v8\');\n',
      '  if (v8.startupSnapshot && v8.startupSnapshot.isBuildingSnapshot()) {\n',
      '    v8.startupSnapshot.setDeserializeMainFunction(() => {\n',
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
    // Non-snapshot mode
    bundledEntry = augmentedBootstrap + '\n\n' + requireSeaboxShim + '\n' + transformedContent;
  }
  
  return bundledEntry;
}
