/**
 * @file Obfuscate bootstrap code to protect encryption keys and decryption logic
 */

const JavaScriptObfuscator = require('javascript-obfuscator');

/**
 * Obfuscate bootstrap code with maximum protection settings
 * 
 * @param {string} bootstrapCode - The bootstrap JavaScript code to obfuscate
 * @returns {string} Obfuscated JavaScript code
 */
function obfuscateBootstrap(bootstrapCode) {
  const obfuscationResult = JavaScriptObfuscator.obfuscate(bootstrapCode, {
    // Maximum protection settings for encryption key and decryption logic
    
    // String encoding
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
    
    // Control flow
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    
    // Code transformations
    transformObjectKeys: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    
    // Identifiers
    identifierNamesGenerator: 'hexadecimal',
    identifiersPrefix: '',
    renameGlobals: false, // Keep false - we need to preserve global scope
    renameProperties: false, // Keep false - breaks sea.getAsset patching
    
    // Self-defending
    selfDefending: true,
    
    // Compact output
    compact: true,
    
    // Additional obfuscation
    numbersToExpressions: true,
    simplify: true,
    
    // Disable source maps (we don't want them)
    sourceMap: false,
    
    // Performance vs protection tradeoff
    // (these settings prioritize protection over performance)
    target: 'node',
    ignoreImports: true,
    
    // Comments removal
    // (handled automatically by compact: true)
  });

  return obfuscationResult.getObfuscatedCode();
}

module.exports = {
  obfuscateBootstrap
};
