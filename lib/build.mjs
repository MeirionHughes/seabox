/**
 * build.mjs (v2)
 * Main build orchestrator using v2 architecture with multi-target support.
 */

import { loadConfig } from './config.mjs';
import { MultiTargetBuilder } from './multi-target-builder.mjs';
import * as diag from './diagnostics.mjs';
import fs from 'fs';

/**
 * Main build function for v2
 * @param {Object} options - Build options
 * @param {string} [options.configPath] - Path to config file
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {boolean} [options.debug] - Keep temporary build files
 * @param {string} [options.projectRoot] - Project root directory
 */
export async function build(options = {}) {
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

  try {
    // Load configuration
    const config = loadConfig(configPath, projectRoot);
    
    // Config should exist if we got here (CLI checks first)
    if (!config) {
      throw new Error('No configuration found. Run: npx seabox init');
    }
    
    // Override verbose from CLI if specified
    if (verbose) {
      config.verbose = true;
    }

    // Create and run multi-target builder
    const builder = new MultiTargetBuilder(config, projectRoot);
    const results = await builder.buildAll();

    // Display results
    diag.separator();
    diag.info('Output files:');
    for (const result of results) {
      const size = diag.formatSize(fs.statSync(result.path).size);
      diag.info(`  ${result.target}: ${result.path} (${size})`);
    }
    diag.separator();

    return results;
  } catch (error) {
    diag.separator();
    diag.error(`Build failed: ${error.message}`);
    if (verbose || process.argv.includes('--verbose')) {
      console.error(error.stack);
    }
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  build().catch(error => {
    process.exit(1);
  });
}
