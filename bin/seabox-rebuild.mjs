#!/usr/bin/env node
/**
 * seabox-rebuild.mjs
 * Rebuild native modules for target platform/architecture
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as diag from '../lib/diagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Rebuild a native module for a specific target
 * @param {string} modulePath - Path to the native module
 * @param {string} nodeVersion - Target Node.js version (e.g., "24.13.0")
 * @param {string} platform - Target platform (win32, linux, darwin)
 * @param {string} arch - Target architecture (x64, arm64)
 * @param {boolean} verbose - Enable verbose logging
 */
function rebuildNativeModule(modulePath, nodeVersion, platform, arch, verbose = false) {
  diag.setVerbose(verbose);
  
  diag.verbose(`Rebuilding native module: ${modulePath}`);
  diag.verbose(`Target: Node.js ${nodeVersion} ${platform}-${arch}`);

  const packageJsonPath = path.join(modulePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${modulePath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const moduleName = pkg.name;

  // Check if module has native bindings
  const hasBindingGyp = fs.existsSync(path.join(modulePath, 'binding.gyp'));
  if (!hasBindingGyp && !pkg.gypfile) {
    diag.verbose(`Module ${moduleName} does not appear to have native bindings, skipping`);
    return;
  }

  try {
    // Use node-gyp to rebuild for the target Node.js version, platform, and architecture
    // --target specifies the Node.js version (critical for NODE_MODULE_VERSION)
    // --dist-url ensures node-gyp downloads headers from the correct location
    const cmd = `npx node-gyp rebuild --target=${nodeVersion} --arch=${arch} --dist-url=https://nodejs.org/dist`;
    
    diag.verbose(`Building for Node.js ${nodeVersion} (${platform}-${arch})`, 2);
    diag.verbose(`Command: ${cmd}`, 2);

    execSync(cmd, {
      cwd: modulePath,
      stdio: 'pipe',  // Hide output unless error occurs
      env: {
        ...process.env,
        npm_config_target: nodeVersion,
        npm_config_arch: arch,
        npm_config_target_arch: arch,
        npm_config_disturl: 'https://nodejs.org/dist'
      }
    });

    diag.verbose(`Successfully built for Node.js ${nodeVersion}`, 2);
  } catch (error) {
    // Show node-gyp output on error
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    diag.verbose(`Failed to rebuild ${moduleName}: ${error.message}`);
    throw error;
  }
}

// CLI entry point - compare normalized paths for cross-platform compatibility
const isMainModule = (() => {
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const argPath = path.resolve(process.argv[1]);
    return scriptPath === argPath;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const args = process.argv.slice(2);
  
  if (args.length < 4) {
    diag.error('Usage: seabox-rebuild <module-path> <node-version> <platform> <arch> [--verbose]');
    process.exit(1);
  }

  const [modulePath, nodeVersion, platform, arch] = args;
  const verbose = args.includes('--verbose') || args.includes('-v');

  try {
    rebuildNativeModule(modulePath, nodeVersion, platform, arch, verbose);
    process.exit(0);
  } catch (error) {
    diag.error(`Rebuild failed: ${error.message}`);
    process.exit(1);
  }
}

export { rebuildNativeModule };
