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
      console.log('❌ No configuration found\n');
      console.log('Seabox looks for configuration in this order:');
      console.log('  1. --config <path> (command line argument)');
      console.log('  2. seabox.config.json (in current directory)');
      console.log('  3. "seabox" field in package.json\n');
      console.log('To get started, run: npx seabox init\n');
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
      console.error('❌ Error: seabox.config.json already exists');
      process.exit(1);
    }

    const defaultConfig = generateDefaultConfig({
      entry: './src/index.js'
    });

    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + '\n', 'utf8');
    
    console.log('✅ Created seabox.config.json');
    console.log('\n📝 Next steps:');
    console.log('   1. Edit seabox.config.json to configure your build');
    console.log('   2. Run: npx seabox build\n');
  },

  help: () => {
    console.log('Seabox v2 - Node.js Single Executable Application Builder\n');
    console.log('Usage: seabox [command] [options]\n');
    console.log('Commands:');
    console.log('  build      Build executable(s) for configured targets (default)');
    console.log('  init       Create a default seabox.config.json\n');
    console.log('Build Options:');
    console.log('  --config   Path to config file (default: seabox.config.json)');
    console.log('  --verbose  Enable verbose logging');
    console.log('  --debug    Keep temporary build files\n');
    console.log('Examples:');
    console.log('  seabox init');
    console.log('  seabox build');
    console.log('  seabox --verbose           # Same as: seabox build --verbose');
    console.log('  seabox build --verbose\n');
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
      console.error('Error:', error.message);
      if (args.includes('--verbose')) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}\n`);
    commands.help();
    process.exit(1);
  }
}

main();
