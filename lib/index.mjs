/**
 * index.mjs
 * Main entry point for Seabox v2 library.
 * Exports all public APIs.
 */

export { build } from './build.mjs';
export { 
  loadConfig, 
  validateConfig, 
  parseTarget, 
  generateDefaultConfig,
  normalizeConfig,
  getDefaultLibraryPatterns
} from './config.mjs';
export { MultiTargetBuilder } from './multi-target-builder.mjs';
export { bundleWithRollup, NativeModuleDetectorPlugin } from './rolldown-bundler.mjs';
export { scanDependenciesForNativeModules, findNativeModuleBuildPath } from './native-scanner.mjs';
export { BuildCache } from './build-cache.mjs';
export { generateManifest, serializeManifest } from './manifest.mjs';
export { createSeaConfig, writeSeaConfigJson, generateBlob } from './blob.mjs';
export { fetchNodeBinary } from './fetch-node.mjs';
export { injectBlob } from './inject.mjs';
export { generateEncryptionKey, encryptAsset, decryptAsset, encryptAssets, keyToObfuscatedCode } from './crypto-assets.mjs';
export { obfuscateBootstrap } from './obfuscate.mjs';
export { bundleEntry } from './entry-bundler.mjs';
