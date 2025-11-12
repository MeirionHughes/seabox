#!/usr/bin/env node

/**
 * CLI entry point for SEA builder
 */

const { build } = require('../lib');
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);

  const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : undefined;
  const verbose = args.includes('--verbose');
  const debug = args.includes('--debug');

  let showHelp = args.includes('--help') || args.includes('-h');

  // Try to load config to check if it exists
  if (!configPath) {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) {
      showHelp = true;
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg.seabox) {
      showHelp = true;
    }
  }

  // Show help
  if (showHelp) {
    console.log(`
SeaBox - Node.js Single Executable Application Builder

Usage:
  seabox [options]

Options:
  --config <path>    Path to config file (default: reads from package.json)
  --verbose          Enable verbose logging
  --debug            Keep temporary build files for debugging
  --help, -h         Show this help message

Configuration:
  Add a "seabox" field to your package.json:
  {
    "seabox": {
      "entry": "./out/app.js",
      "assets": ["./out/**/*"],
      "binaries": ["*.node", "*.dll"],
      "targets": ["node24.11.0-win32-x64"],
      "output": "myapp.exe",
      "outputPath": "dist",
      "useSnapshot": false
    }
  }

For more information, see the documentation.
`);

  }

  try {
    await build({
      configPath,
      verbose,
      debug,
      projectRoot: process.cwd()
    });
  } catch (error) {
    console.error('Build failed:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
