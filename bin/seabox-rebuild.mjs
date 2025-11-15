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
 * @param {string} platform - Target platform (win32, linux, darwin)
 * @param {string} arch - Target architecture (x64, arm64)
 * @param {boolean} verbose - Enable verbose logging
 */
function rebuildNativeModule(modulePath, platform, arch, verbose = false) {
  diag.setVerbose(verbose);
  
  diag.verbose(`Rebuilding native module: ${modulePath}`);
  diag.verbose(`Target: ${platform}-${arch}`);

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
    // Use node-gyp to rebuild for the target platform
    const cmd = `npx node-gyp rebuild --target_platform=${platform} --target_arch=${arch}`;
    
    diag.verbose(`Running: ${cmd}`);

    execSync(cmd, {
      cwd: modulePath,
      stdio: verbose ? 'inherit' : 'pipe',
      env: {
        ...process.env,
        npm_config_target_platform: platform,
        npm_config_target_arch: arch
      }
    });

    diag.verbose(`Successfully rebuilt ${moduleName}`);
  } catch (error) {
    diag.verbose(`Failed to rebuild ${moduleName}: ${error.message}`);
    throw error;
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    diag.error('Usage: seabox-rebuild <module-path> <platform> <arch> [--verbose]');
    process.exit(1);
  }

  const [modulePath, platform, arch] = args;
  const verbose = args.includes('--verbose') || args.includes('-v');

  try {
    rebuildNativeModule(modulePath, platform, arch, verbose);
    process.exit(0);
  } catch (error) {
    diag.error(`Rebuild failed: ${error.message}`);
    process.exit(1);
  }
}

export { rebuildNativeModule };
