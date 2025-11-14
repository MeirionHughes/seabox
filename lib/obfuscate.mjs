/**
 * obfuscate.mjs
 * Obfuscate bootstrap code to protect encryption keys and decryption logic
 */

import Module from 'module';

const require = Module.createRequire(import.meta.url);
const JavaScriptObfuscator = require('javascript-obfuscator');

/**
 * Obfuscate bootstrap code with maximum protection settings
 * 
 * @param {string} bootstrapCode - The bootstrap JavaScript code to obfuscate
 * @returns {string} Obfuscated JavaScript code
 */
export function obfuscateBootstrap(bootstrapCode) {
  const obfuscationResult = JavaScriptObfuscator.obfuscate(bootstrapCode, {
    // Maximum protection settings for encryption key and decryption logic
    stringArray: true,
    stringArrayThreshold: 1,
    stringArrayEncoding: ['rc4'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 5,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 5,
    stringArrayWrappersType: 'function',
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    transformObjectKeys: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: '',
    renameGlobals: false,
    renameProperties: false,
    selfDefending: true,
    compact: true,
    numbersToExpressions: true,
    simplify: true,
    target: 'node',
    ignoreImports: true,
    sourceMap: false
  });

  return obfuscationResult.getObfuscatedCode();
}
