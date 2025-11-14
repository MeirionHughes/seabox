/**
 * multi-target-builder.mjs
 * Orchestrate parallel builds for multiple target platforms.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Module from 'module';

import { bundleWithRollup } from './rolldown-bundler.mjs';
import { scanDependenciesForNativeModules } from './native-scanner.mjs';
import { BuildCache } from './build-cache.mjs';
import { parseTarget } from './config.mjs';
import { generateManifest, serializeManifest } from './manifest.mjs';
import { createSeaConfig, writeSeaConfigJson, generateBlob } from './blob.mjs';
import { fetchNodeBinary } from './fetch-node.mjs';
import { injectBlob } from './inject.mjs';
import { generateEncryptionKey, encryptAssets, keyToObfuscatedCode } from './crypto-assets.mjs';
import { obfuscateBootstrap } from './obfuscate.mjs';
import { bundleEntry } from './entry-bundler.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = Module.createRequire(import.meta.url);

/**
 * Multi-target build orchestrator
 */
export class MultiTargetBuilder {
  /**
   * @param {import('./config.mjs').SeaboxConfigV2} config - Build configuration
   * @param {string} projectRoot - Project root directory
   */
  constructor(config, projectRoot = process.cwd()) {
    this.config = config;
    this.projectRoot = projectRoot;
    this.cache = new BuildCache(path.join(projectRoot, '.seabox-cache'));
    this.verbose = config.verbose || false;
  }

  /**
   * Build all configured targets
   * @returns {Promise<Array<{target: string, path: string}>>}
   */
  async buildAll() {
    console.log('🚀 Seabox Multi-Target Build');
    console.log('═══════════════════════════════════════\n');

    // Step 1: Bundle entry once (platform-agnostic JavaScript)
    const { bundledPath, nativeModules, detectedAssets } = await this.bundleEntry();

    if (this.verbose && detectedAssets.size > 0) {
      console.log('\n🔍 Auto-detected assets:');
      for (const assetPath of detectedAssets) {
        console.log(`   - ${assetPath}`);
      }
    }

    // Step 2: Scan for additional native modules in node_modules
    const scannedNatives = await this.scanNativeModules();

    // Merge detected native modules
    const allNativeModules = this.mergeNativeModules(nativeModules, scannedNatives);

    if (this.verbose && allNativeModules.size > 0) {
      console.log('\n📦 Native modules detected:');
      for (const [name, info] of allNativeModules) {
        console.log(`   - ${name}: ${info.packageRoot}`);
      }
    }

    // Step 3: Build all targets (can be parallelized)
    console.log(`\n🎯 Building ${this.config.outputs.length} target(s)...\n`);
    
    const buildPromises = this.config.outputs.map((output, index) =>
      this.buildTarget(output, bundledPath, allNativeModules, detectedAssets, index + 1)
    );

    const results = await Promise.all(buildPromises);

    console.log('\n✅ All builds completed successfully!');
    console.log('═══════════════════════════════════════\n');
    
    return results;
  }

  /**
   * Bundle the entry file with Rollup
   * @returns {Promise<{bundledPath: string, nativeModules: Map}>}
   */
  async bundleEntry() {
    console.log('[1/6] 📝 Bundling application with Rollup...');
    
    const entryPath = path.resolve(this.projectRoot, this.config.entry);
    
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }

    const bundledPath = path.join(this.projectRoot, 'out', '_sea-entry.js');
    
    // Create output directory
    fs.mkdirSync(path.dirname(bundledPath), { recursive: true });

    const result = await bundleWithRollup(
      entryPath, 
      bundledPath, 
      { ...this.config, _projectRoot: this.projectRoot }, 
      process.platform,  // Use current platform for bundling (JavaScript is platform-agnostic)
      process.arch,
      this.verbose
    );
    
    console.log(`   ✓ Bundle created: ${bundledPath}`);
    
    return result;
  }

  /**
   * Scan node_modules for native modules
   * @returns {Promise<Array>}
   */
  async scanNativeModules() {
    if (this.verbose) {
      console.log('\n[2/6] 🔍 Scanning node_modules for native modules...');
    }
    
    const nativeModules = await scanDependenciesForNativeModules(this.projectRoot, this.verbose);
    
    return nativeModules;
  }

  /**
   * Merge detected native modules from bundler and scanner
   */
  mergeNativeModules(bundlerModules, scannedModules) {
    const merged = new Map(bundlerModules);
    
    // Add scanned modules that weren't detected during bundling
    for (const scanned of scannedModules) {
      if (!merged.has(scanned.name)) {
        merged.set(scanned.name, {
          packageRoot: scanned.path,
          moduleName: scanned.name,
          buildPath: path.join(scanned.path, 'build/Release'),
          binaryFiles: scanned.binaryFiles
        });
      }
    }
    
    return merged;
  }

  /**
   * Build a single target
   * @param {import('./config.mjs').OutputTarget} outputConfig - Target configuration
   * @param {string} bundledEntryPath - Path to bundled entry
   * @param {Map} nativeModules - Detected native modules
   * @param {Set<string>} detectedAssets - Auto-detected assets from bundler
   * @param {number} buildNumber - Build number for display
   * @returns {Promise<{target: string, path: string}>}
   */
  async buildTarget(outputConfig, bundledEntryPath, nativeModules, detectedAssets, buildNumber) {
    const { target, path: outputPath, output: executableName } = outputConfig;
    const { nodeVersion, platform, arch } = parseTarget(target);

    console.log(`\n[Build ${buildNumber}] Target: ${target}`);
    console.log('─────────────────────────────────────────');

    // Step 1: Rebuild native modules for this target
    const rebuiltModules = await this.rebuildNativeModulesForTarget(
      nativeModules,
      target,
      buildNumber
    );

    // Step 2: Collect config assets (manual globs)
    const configAssets = await this.collectConfigAssets(
      this.config.assets || [],
      buildNumber
    );

    // Step 3: Collect auto-detected assets (from path.join(__dirname, ...))
    const autoAssets = await this.collectDetectedAssets(
      detectedAssets,
      buildNumber
    );

    // Step 4: Collect platform-specific libraries (DLLs/SOs)
    const platformLibraries = await this.collectPlatformLibraries(
      outputConfig.libraries,
      platform,
      arch,
      buildNumber
    );

    // Step 5: Prepare bundled entry with bootstrap
    const finalEntryPath = await this.prepareFinalEntry(
      bundledEntryPath,
      buildNumber
    );

    // Step 6: Combine all assets (dedupe by assetKey)
    const assetMap = new Map();
    
    // Add in order of priority (later overwrites earlier)
    for (const asset of [...rebuiltModules, ...configAssets, ...autoAssets, ...platformLibraries]) {
      assetMap.set(asset.assetKey, asset);
    }
    
    const allAssets = Array.from(assetMap.values());

    // Step 7: Generate SEA
    await this.generateSEAForTarget({
      assets: allAssets,
      entryPath: finalEntryPath,
      target,
      outputPath,
      executableName,
      platform,
      arch,
      nodeVersion,
      rcedit: outputConfig.rcedit,
      buildNumber
    });

    const finalPath = path.join(outputPath, executableName);
    console.log(`   ✅ Build complete: ${finalPath}`);

    return {
      target,
      path: finalPath
    };
  }

  /**
   * Rebuild native modules for specific target
   */
  async rebuildNativeModulesForTarget(nativeModules, target, buildNumber) {
    if (nativeModules.size === 0) {
      return [];
    }

    console.log(`   [${buildNumber}.1] 🔨 Rebuilding ${nativeModules.size} native module(s)...`);

    const rebuiltAssets = [];
    const { platform, arch } = parseTarget(target);

    for (const [moduleName, moduleInfo] of nativeModules) {
      try {
        // Check cache first
        const cachedBuild = this.cache.getCachedNativeBuild(moduleInfo.packageRoot, target);
        
        if (cachedBuild) {
          if (this.verbose) {
            console.log(`      ✓ Using cached build: ${moduleName}`);
          }
          
          rebuiltAssets.push({
            sourcePath: cachedBuild,
            assetKey: `native/${moduleName}.node`,
            isBinary: true,
            hash: await this.computeHash(cachedBuild)
          });
          continue;
        }

        // Rebuild the module
        if (this.verbose) {
          console.log(`      🔧 Rebuilding: ${moduleName}`);
        }

        await this.rebuildNativeModule(moduleInfo.packageRoot, target);

        // Find the built binary
        const builtPath = await this.findBuiltBinary(moduleInfo, target);
        
        if (builtPath) {
          // Cache the build
          this.cache.cacheNativeBuild(moduleInfo.packageRoot, target, builtPath);
          
          rebuiltAssets.push({
            sourcePath: builtPath,
            assetKey: `native/${moduleName}.node`,
            isBinary: true,
            hash: await this.computeHash(builtPath)
          });
          
          if (this.verbose) {
            console.log(`      ✓ Built: ${moduleName} -> ${builtPath}`);
          }
        }
      } catch (err) {
        console.warn(`      ⚠️  Failed to rebuild ${moduleName}:`, err.message);
      }
    }

    console.log(`   ✓ Native modules processed`);
    return rebuiltAssets;
  }

  /**
   * Rebuild a single native module
   */
  async rebuildNativeModule(packageRoot, target) {
    const rebuildScript = path.join(__dirname, '..', 'bin', 'seabox-rebuild.mjs');
    
    if (!fs.existsSync(rebuildScript)) {
      throw new Error('seabox-rebuild.mjs not found');
    }

    try {
      execSync(`node "${rebuildScript}" --target ${target} "${packageRoot}"`, {
        stdio: this.verbose ? 'inherit' : 'pipe',
        cwd: this.projectRoot
      });
    } catch (err) {
      throw new Error(`Rebuild failed: ${err.message}`);
    }
  }

  /**
   * Find the built .node binary
   */
  async findBuiltBinary(moduleInfo, target) {
    // Try common build locations
    const searchPaths = [
      path.join(moduleInfo.packageRoot, 'build/Release'),
      path.join(moduleInfo.packageRoot, 'build/Debug'),
      moduleInfo.buildPath
    ];

    for (const searchPath of searchPaths) {
      if (fs.existsSync(searchPath)) {
        const files = fs.readdirSync(searchPath);
        const nodeFile = files.find(f => f.endsWith('.node'));
        
        if (nodeFile) {
          return path.join(searchPath, nodeFile);
        }
      }
    }

    return null;
  }

  /**
   * Collect platform-specific libraries (DLLs, SOs, DYLIBs) that need filesystem extraction
   * @param {string[]} libraryPatterns - Glob patterns for libraries
   * @param {string} platform - Target platform
   * @param {string} arch - Target architecture
   * @param {number} buildNumber - Build number for display
   */
  async collectPlatformLibraries(libraryPatterns, platform, arch, buildNumber) {
    // Use provided patterns or default to platform-specific patterns
    const { getDefaultLibraryPatterns } = await import('./config.mjs');
    const patterns = libraryPatterns && libraryPatterns.length > 0 
      ? libraryPatterns 
      : getDefaultLibraryPatterns(platform);

    if (!patterns || patterns.length === 0) {
      return [];
    }

    console.log(`   [${buildNumber}.4] 📚 Collecting platform libraries (${platform})...`);

    const { glob } = await import('glob');
    const libraries = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        nodir: true,
        absolute: false,
        ignore: ['**/node_modules/**', '**/.git/**']
      });

      for (const match of matches) {
        const sourcePath = path.resolve(this.projectRoot, match);
        
        libraries.push({
          sourcePath,
          assetKey: match.replace(/\\/g, '/'),
          isBinary: true,
          hash: await this.computeHash(sourcePath)
        });
      }
    }

    if (libraries.length > 0) {
      console.log(`   ✓ Collected ${libraries.length} library file(s)`);
    }

    return libraries;
  }

  /**
   * Collect assets from config globs
   * @param {string[]} assetPatterns - Glob patterns for assets
   * @param {number} buildNumber - Build number for display
   */
  async collectConfigAssets(assetPatterns, buildNumber) {
    if (!assetPatterns || assetPatterns.length === 0) {
      return [];
    }

    console.log(`   [${buildNumber}.2] 📦 Collecting config assets...`);

    const { glob } = await import('glob');
    const assets = [];

    for (const pattern of assetPatterns) {
      const matches = await glob(pattern, {
        cwd: this.projectRoot,
        nodir: true,
        absolute: false,
        ignore: ['**/node_modules/**', '**/.git/**']
      });

      for (const match of matches) {
        const sourcePath = path.resolve(this.projectRoot, match);
        
        assets.push({
          sourcePath,
          assetKey: match.replace(/\\/g, '/'),
          isBinary: this.isBinaryFile(sourcePath),
          hash: await this.computeHash(sourcePath)
        });
      }
    }

    if (assets.length > 0) {
      console.log(`   ✓ Collected ${assets.length} config asset(s)`);
    }

    return assets;
  }

  /**
   * Collect auto-detected assets from bundler (path.join(__dirname, ...))
   * @param {Set<string>} detectedAssets - Asset paths detected during bundling
   * @param {number} buildNumber - Build number for display
   */
  async collectDetectedAssets(detectedAssets, buildNumber) {
    if (!detectedAssets || detectedAssets.size === 0) {
      return [];
    }

    console.log(`   [${buildNumber}.3] 🔍 Processing auto-detected assets...`);

    const assets = [];

    for (const assetKey of detectedAssets) {
      const sourcePath = path.resolve(this.projectRoot, assetKey);
      
      // Verify file still exists
      if (fs.existsSync(sourcePath)) {
        assets.push({
          sourcePath,
          assetKey: assetKey,
          isBinary: this.isBinaryFile(sourcePath),
          hash: await this.computeHash(sourcePath)
        });
      }
    }

    if (assets.length > 0) {
      console.log(`   ✓ Collected ${assets.length} auto-detected asset(s)`);
    }

    return assets;
  }

  /**
   * Check if a file is binary based on extension
   */
  isBinaryFile(filePath) {
    const binaryExtensions = ['.node', '.dll', '.so', '.dylib', '.exe', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
    const ext = path.extname(filePath).toLowerCase();
    return binaryExtensions.includes(ext);
  }

  /**
   * Prepare final entry with bootstrap
   */
  async prepareFinalEntry(bundledEntryPath, buildNumber) {
    console.log(`   [${buildNumber}.3] 🎁 Preparing bootstrap...`);

    const bootstrapPath = path.join(__dirname, 'bootstrap.cjs');
    const bootstrapContent = fs.readFileSync(bootstrapPath, 'utf8');
    
    let augmentedBootstrap = bootstrapContent;

    // Handle encryption if enabled
    if (this.config.encryptAssets) {
      const encryptionKey = generateEncryptionKey();
      const keyCode = keyToObfuscatedCode(encryptionKey);
      
      const encryptionSetup = `
const SEA_ENCRYPTION_KEY = ${keyCode};
const SEA_ENCRYPTED_ASSETS = new Set([]);
`;
      
      augmentedBootstrap = bootstrapContent.replace(
        "  'use strict';",
        "  'use strict';\n" + encryptionSetup
      );
      
      if (this.verbose) {
        console.log('      ✓ Encryption enabled and bootstrap obfuscated');
      }
      
      augmentedBootstrap = obfuscateBootstrap(augmentedBootstrap);
    }

    // Read bundled entry
    const entryContent = fs.readFileSync(bundledEntryPath, 'utf8');

    // Bundle with bootstrap
    const finalEntry = bundleEntry(entryContent, augmentedBootstrap, this.config.useSnapshot, this.verbose);
    
    // Write final entry
    const finalPath = bundledEntryPath.replace('.js', '-final.js');
    fs.writeFileSync(finalPath, finalEntry, 'utf8');

    console.log(`   ✓ Bootstrap prepared`);
    return finalPath;
  }

  /**
   * Generate SEA for a specific target
   */
  async generateSEAForTarget(options) {
    const {
      assets,
      entryPath,
      target,
      outputPath: outputDir,
      executableName,
      platform,
      arch,
      nodeVersion,
      rcedit,
      buildNumber
    } = options;

    console.log(`   [${buildNumber}.4] 🔧 Generating SEA blob...`);

    // Generate manifest
    const manifest = generateManifest(
      assets,
      {
        _packageName: this.config._packageName || 'app',
        _packageVersion: this.config._packageVersion || '1.0.0',
        cacheLocation: this.config.cacheLocation
      },
      platform,
      arch
    );

    const manifestJson = serializeManifest(manifest);
    const manifestAsset = {
      sourcePath: null,
      assetKey: 'sea-manifest.json',
      isBinary: false,
      content: Buffer.from(manifestJson, 'utf8')
    };

    const allAssets = [...assets, manifestAsset];

    // Create SEA config
    const tempDir = path.join(this.projectRoot, 'out', '.sea-temp', target);
    fs.mkdirSync(tempDir, { recursive: true });

    const blobOutputPath = path.join(tempDir, 'sea-blob.blob');
    const seaConfig = createSeaConfig(entryPath, blobOutputPath, allAssets, this.config);
    
    const seaConfigPath = path.join(tempDir, 'sea-config.json');
    writeSeaConfigJson(seaConfig, seaConfigPath, allAssets, tempDir);

    // Generate blob
    await generateBlob(seaConfigPath, process.execPath);
    console.log(`   ✓ SEA blob generated`);

    // Fetch Node binary
    console.log(`   [${buildNumber}.5] 📥 Fetching Node.js binary...`);
    const cacheDir = path.join(this.projectRoot, 'node_modules', '.cache', 'sea-node-binaries');
    const nodeBinary = await fetchNodeBinary(nodeVersion, platform, arch, cacheDir);
    console.log(`   ✓ Node binary ready`);

    // Inject blob
    console.log(`   [${buildNumber}.6] 💉 Injecting blob into executable...`);
    const outputExe = path.join(outputDir, executableName);
    await injectBlob(nodeBinary, blobOutputPath, outputExe, platform, this.verbose, rcedit);

    // Cleanup
    if (!this.verbose) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const sizeMB = (fs.statSync(outputExe).size / 1024 / 1024).toFixed(2);
    console.log(`   ✓ Injected (${sizeMB} MB)`);
  }

  /**
   * Compute SHA-256 hash of a file
   */
  async computeHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
