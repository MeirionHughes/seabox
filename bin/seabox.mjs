#!/usr/bin/env node
/**
 * seabox.mjs
 * CLI entry point for Seabox architecture (testing/development)
 * 
 * Usage:
 *   seabox build [--config path] [--verbose]
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Module from 'module';
import * as diag from '../lib/diagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = {
  build: async (args) => {
    const { loadConfig } = await import('../lib/config.mjs');
    
    const configPath = args.includes('--config') ? args[args.indexOf('--config') + 1] : null;
    const projectRoot = process.cwd();
    
    // Check if config exists before attempting build
    const config = loadConfig(configPath, projectRoot);
    
    if (!config) {
      diag.error('No configuration found');
      diag.separator();
      diag.info('Seabox looks for configuration in this order:');
      diag.numberedItem(1, '--config <path> (command line argument)');
      diag.numberedItem(2, 'seabox.config.json (in current directory)');
      diag.numberedItem(3, '"seabox" field in package.json');
      diag.separator();
      diag.info('To get started, run: npx seabox init');
      diag.separator();
      commands.help();
      process.exit(1);
    }
    
    const { build } = await import('../lib/build.mjs');
    
    const options = {
      configPath,
      verbose: args.includes('--verbose') || args.includes('-v'),
      debug: args.includes('--debug'),
      projectRoot
    };

    await build(options);
  },

  migrate: async (args) => {
    // Use CommonJS require for the migration tool
    const require = Module.createRequire(import.meta.url);
    const { migrate } = require('./seabox-migrate.js');
    await migrate();
  },

  init: async (args) => {
    const { generateDefaultConfig } = await import('../lib/config.mjs');
    
    const configPath = path.join(process.cwd(), 'seabox.config.json');
    
    if (fs.existsSync(configPath)) {
      diag.error('seabox.config.json already exists');
      process.exit(1);
    }

    const defaultConfig = generateDefaultConfig({
      entry: './src/index.js'
    });

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
    
    diag.success('Created seabox.config.json', 0);
    diag.separator();
    diag.info('Next steps:');
    diag.numberedItem(1, 'Edit seabox.config.json to configure your build');
    diag.numberedItem(2, 'Run: npx seabox build');
    diag.separator();
  },

  help: () => {
    diag.info('Seabox v2 - Node.js Single Executable Application Builder');
    diag.separator();
    diag.info('Usage: seabox [command] [options]');
    diag.separator();
    diag.info('Commands:');
    diag.info('  build      Build executable(s) for configured targets (default)');
    diag.info('  init       Create a default seabox.config.json');
    diag.separator();
    diag.info('Build Options:');
    diag.info('  --config   Path to config file (default: seabox.config.json)');
    diag.info('  --verbose  Enable verbose logging');
    diag.info('  --debug    Keep temporary build files');
    diag.separator();
    diag.info('Examples:');
    diag.info('  seabox init');
    diag.info('  seabox build');
    diag.info('  seabox --verbose           # Same as: seabox build --verbose');
    diag.info('  seabox build --verbose');
    diag.separator();
  }
};

async function main() {
  const args = process.argv.slice(2);
  
  // If no args or first arg is a flag, default to help
  if (args.length === 0) {
    commands.help();
    return;
  }
  
  // Check if first arg is a flag (starts with --)
  const firstArg = args[0];
  let command = firstArg;
  let commandArgs = args.slice(1);
  
  if (firstArg.startsWith('-')) {
    // First arg is a flag, so default to 'build' command
    command = 'build';
    commandArgs = args; // Include all args including the flags
  }

  if (commands[command]) {
    try {
      await commands[command](commandArgs);
    } catch (error) {
      diag.error(error.message);
      if (args.includes('--verbose')) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  } else {
    diag.error(`Unknown command: ${command}`);
    diag.separator();
    commands.help();
    process.exit(1);
  }
}

main();
