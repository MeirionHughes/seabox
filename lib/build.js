/**
 * build.js
 * Main orchestrator for SEA build pipeline.
 * Usage: node scripts/sea/build.js [--config <path>] [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { loadConfig, parseTarget } = require('./config');
const { scanAssets, groupAssets } = require('./scanner');
const { generateManifest, serializeManifest } = require('./manifest');
const { createSeaConfig, writeSeaConfigJson, generateBlob } = require('./blob');
const { fetchNodeBinary } = require('./fetch-node');
const { injectBlob } = require('./inject');
const { generateEncryptionKey, encryptAssets, keyToObfuscatedCode } = require('./crypto-assets');
const { obfuscateBootstrap } = require('./obfuscate');
const { bundleEntry } = require('./entry-bundler');
const { execSync } = require('child_process');

/**
 * Main build orchestrator.
 * @param {Object} options - Build options
 * @param {string} [options.configPath] - Path to config file
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {boolean} [options.debug] - Keep temporary build files
 * @param {string} [options.projectRoot] - Project root directory
 */
async function build(options = {}) {
  // Support both options object and legacy process.argv parsing
  let configPath = options.configPath;
  let verbose = options.verbose;
  let debug = options.debug;
  let projectRoot = options.projectRoot || process.cwd();
  
  // Fallback to process.argv if called without options
  if (!options.configPath && !options.verbose && !options.debug) {
    const args = process.argv.slice(2);
    configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;
    verbose = args.includes('--verbose');
    debug = args.includes('--debug');
  }

  if (!verbose) {
    console.log('Building SEA...');
  }

  const config = loadConfig(configPath, projectRoot);
  
  if (verbose) {
    console.log('[1/8] Loading configuration');
    console.log('Config:', JSON.stringify(config, null, 2));
  }

  const target = config.targets[0];
  const { nodeVersion, platform, arch } = parseTarget(target);
  
  if (verbose) {
    console.log(`Target: Node ${nodeVersion} on ${platform}-${arch}`);
  }

  if (config.rebuild) {
    if (verbose) console.log('[1b] Rebuilding native modules');
    const rebuildScript = path.join(__dirname, '..', 'bin', 'seabox-rebuild.js');
    try {
      execSync(`node "${rebuildScript}" --target ${target} "${projectRoot}"`, {
        stdio: verbose ? 'inherit' : 'ignore'
      });
      if (verbose) console.log('✓ Native modules rebuilt');
    } catch (error) {
      console.error('✗ Native module rebuild failed:', error.message);
      throw new Error('Native module rebuild failed. See output above for details.');
    }
  }

  const assets = await scanAssets(
    config.assets,
    config.binaries || [],
    config.exclude || [],
    projectRoot
  );

  const { binaries, nonBinaries } = groupAssets(assets);
  
  if (verbose) {
    console.log(`[2/8] Scanning assets`);
    console.log(`Found ${assets.length} assets (${binaries.length} binaries, ${nonBinaries.length} non-binaries)`);
    console.log('Binaries:', binaries.map(b => b.assetKey));
    const nonBinariesList = assets.filter(a => !a.isBinary);
    console.log('Non-binary assets:', nonBinariesList.map(a => a.assetKey));
  }

  let encryptionKey = null;
  let encryptedAssetKeys = new Set();
  
  if (config.encryptAssets) {
    if (verbose) console.log('[2b] Encrypting assets');
    encryptionKey = generateEncryptionKey();
    
    const excludeFromEncryption = [
      'sea-manifest.json',
      ...(config.encryptExclude || [])
    ];
    
    const encryptedMap = encryptAssets(assets, encryptionKey, excludeFromEncryption);
    
    for (const asset of assets) {
      if (encryptedMap.has(asset.assetKey)) {
        asset.content = encryptedMap.get(asset.assetKey);
        asset.encrypted = true;
        encryptedAssetKeys.add(asset.assetKey);
      }
    }
    
    if (verbose) {
      console.log(`Encrypted ${encryptedAssetKeys.size} assets`);
      console.log('Encrypted assets:', Array.from(encryptedAssetKeys));
    }
  }

  if (verbose) console.log('[3/8] Generating manifest');
  const manifest = generateManifest(assets, config, platform, arch);
  const manifestJson = serializeManifest(manifest);
  
  const manifestAsset = {
    sourcePath: null,
    assetKey: 'sea-manifest.json',
    isBinary: false,
    content: Buffer.from(manifestJson, 'utf8')
  };
  assets.push(manifestAsset);

  if (verbose) console.log('[4/8] Preparing bootstrap');
  const bootstrapPath = path.join(__dirname, 'bootstrap.js');
  const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf8');
  
  let augmentedBootstrap = bootstrapContent;
  if (config.encryptAssets && encryptionKey && encryptedAssetKeys.size > 0) {
    const keyCode = keyToObfuscatedCode(encryptionKey);
    const encryptedKeysJson = JSON.stringify(Array.from(encryptedAssetKeys));
    
    const encryptionSetup = `
const SEA_ENCRYPTION_KEY = ${keyCode};
const SEA_ENCRYPTED_ASSETS = new Set(${encryptedKeysJson});
`;
    
    augmentedBootstrap = bootstrapContent.replace(
      "  'use strict';",
      "  'use strict';\n" + encryptionSetup
    );
    
    if (verbose) console.log('Injecting encryption key and obfuscating bootstrap');
    augmentedBootstrap = obfuscateBootstrap(augmentedBootstrap);
  }
  
  const entryPath = path.resolve(projectRoot, config.entry);
  let entryContent = fs.readFileSync(entryPath, 'utf8');
  
  // Strip shebang if present (e.g., #!/usr/bin/env node) - handle both Unix and Windows line endings
  entryContent = entryContent.replace(/^#!.*(\r?\n)/, '');
  
  // Bundle the entry file with bootstrap and require shim
  const bundledEntry = bundleEntry(entryContent, augmentedBootstrap, config.useSnapshot, verbose);
  
  const bundledEntryPath = path.join(projectRoot, 'out', '_sea-entry.js');
  
  fs.mkdirSync(path.dirname(bundledEntryPath), { recursive: true});
  fs.writeFileSync(bundledEntryPath, bundledEntry, 'utf8');
  
  if (verbose) console.log('[5/8] Creating SEA configuration');
  const blobOutputPath = path.join(projectRoot, 'out', 'sea-blob.blob');
  const seaConfig = createSeaConfig(bundledEntryPath, blobOutputPath, assets, config);
  const seaConfigPath = path.join(projectRoot, 'out', 'sea-config.json');
  const tempDir = path.join(projectRoot, 'out', '.sea-temp');
  fs.mkdirSync(tempDir, { recursive: true });
  writeSeaConfigJson(seaConfig, seaConfigPath, assets, tempDir);

  if (verbose) console.log('[6/8] Generating SEA blob');
  await generateBlob(seaConfigPath, process.execPath);
  
  
  if (verbose) console.log('[7/8] Fetching Node.js binary');
  const cacheDir = path.join(projectRoot, 'node_modules', '.cache', 'sea-node-binaries');
  const nodeBinary = await fetchNodeBinary(nodeVersion, platform, arch, cacheDir);

  if (verbose) console.log('[8/8] Injecting SEA blob into Node binary');
  const outputExe = path.join(projectRoot, config.outputPath, config.output);
  await injectBlob(nodeBinary, blobOutputPath, outputExe, platform, verbose, config.rcedit);

  if (!debug) {
    if (verbose) console.log('Cleaning up temporary files');
    const filesToClean = [seaConfigPath, blobOutputPath];
    for (const file of filesToClean) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
    const tempDir = path.join(projectRoot, 'out', '.sea-temp');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const sizeMB = (fs.statSync(outputExe).size / 1024 / 1024).toFixed(2);
  console.log(`\n✓ Build complete: ${config.output} (${sizeMB} MB)`);
  if (verbose) console.log(`Output path: ${outputExe}`);
}

// Run if called directly
if (require.main === module) {
  build().catch(error => {
    console.error('Build failed:', error.message);
    if (process.argv.includes('--verbose')) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { build };
