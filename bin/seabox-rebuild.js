#!/usr/bin/env node

/**
 * Native Module Rebuilder for SEA Builder
 * 
 * Scans package dependencies to identify native modules (those with binding.gyp
 * or gypfile: true in package.json) and rebuilds them using node-gyp for a
 * target Node.js version and platform.
 * 
 * Supports cross-compilation for different platforms and architectures.
 * Inspired by @electron/rebuild's module identification strategy.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class NativeModuleRebuilder {
  constructor(buildPath, options = {}) {
    this.buildPath = buildPath || process.cwd();
    this.nativeModules = new Map();
    this.visitedPaths = new Set();
    
    // If --current is specified, use the current Node.js version
    if (options.current) {
      this.targetNodeVersion = process.version.replace('v', '');
      this.targetPlatform = process.platform;
      this.targetArch = process.arch;
    } else {
      // Target configuration
      this.targetNodeVersion = options.nodeVersion || process.version.replace('v', '');
      this.targetPlatform = options.platform || process.platform;
      this.targetArch = options.arch || process.arch;
      
      // Parse from target string if provided (e.g., "node24.11.0-win32-x64")
      if (options.target) {
        const match = options.target.match(/^node(\d+\.\d+\.\d+)-(\w+)-(\w+)$/);
        if (match) {
          this.targetNodeVersion = match[1];
          this.targetPlatform = match[2];
          this.targetArch = match[3];
        }
      }
    }
  }

  /**
   * Read and parse package.json from a directory
   */
  readPackageJson(modulePath) {
    const packageJsonPath = path.join(modulePath, 'package.json');
    try {
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`Warning: Could not read package.json at ${packageJsonPath}:`, error.message);
    }
    return null;
  }

  /**
   * Check if a module is a native module
   * A module is considered native if it has:
   * - A binding.gyp file, OR
   * - gypfile: true in package.json
   */
  isNativeModule(modulePath) {
    // Check for binding.gyp
    const bindingGypPath = path.join(modulePath, 'binding.gyp');
    if (fs.existsSync(bindingGypPath)) {
      return true;
    }

    // Check for gypfile: true in package.json
    const packageJson = this.readPackageJson(modulePath);
    if (packageJson && packageJson.gypfile === true) {
      return true;
    }

    return false;
  }

  /**
   * Resolve the actual path of a dependency
   */
  resolveDependencyPath(fromPath, depName) {
    const possiblePaths = [];
    
    // Check in local node_modules
    let currentPath = fromPath;
    while (currentPath !== path.parse(currentPath).root) {
      const nodeModulesPath = path.join(currentPath, 'node_modules', depName);
      if (fs.existsSync(nodeModulesPath)) {
        possiblePaths.push(nodeModulesPath);
      }
      currentPath = path.dirname(currentPath);
    }

    // Return the first valid path, resolving symlinks
    for (const testPath of possiblePaths) {
      try {
        return fs.realpathSync(testPath);
      } catch (error) {
        // Skip if symlink is broken
        continue;
      }
    }

    return null;
  }

  /**
   * Scan a directory's dependencies recursively
   */
  scanDependencies(modulePath, depth = 0) {
    // Resolve symlinks to avoid scanning the same module multiple times
    let realPath;
    try {
      realPath = fs.realpathSync(modulePath);
    } catch (error) {
      console.warn(`Warning: Could not resolve path ${modulePath}:`, error.message);
      return;
    }

    // Skip if already visited
    if (this.visitedPaths.has(realPath)) {
      return;
    }
    this.visitedPaths.add(realPath);

    // Check if this module is a native module
    if (this.isNativeModule(realPath)) {
      const packageJson = this.readPackageJson(realPath);
      const moduleName = packageJson ? packageJson.name : path.basename(realPath);
      
      if (!this.nativeModules.has(realPath)) {
        this.nativeModules.set(realPath, moduleName);
        console.log(`Found native module: ${moduleName} at ${realPath}`);
      }
    }

    // Read package.json to find dependencies
    const packageJson = this.readPackageJson(realPath);
    if (!packageJson) {
      return;
    }

    // Collect all types of dependencies
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
      ...packageJson.devDependencies
    };

    // Scan each dependency
    for (const depName of Object.keys(allDeps)) {
      const depPath = this.resolveDependencyPath(realPath, depName);
      if (depPath) {
        this.scanDependencies(depPath, depth + 1);
      }
    }

    // Also check nested node_modules
    const nodeModulesPath = path.join(realPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      try {
        const modules = fs.readdirSync(nodeModulesPath);
        for (const moduleName of modules) {
          if (moduleName === '.bin') continue;
          
          const modulePath = path.join(nodeModulesPath, moduleName);
          const stat = fs.lstatSync(modulePath);
          
          if (stat.isDirectory()) {
            // Handle scoped packages (e.g., @robgeoltd/lib-m2)
            if (moduleName.startsWith('@')) {
              const scopedModules = fs.readdirSync(modulePath);
              for (const scopedModule of scopedModules) {
                const scopedPath = path.join(modulePath, scopedModule);
                this.scanDependencies(scopedPath, depth + 1);
              }
            } else {
              this.scanDependencies(modulePath, depth + 1);
            }
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not read node_modules at ${nodeModulesPath}:`, error.message);
      }
    }
  }

  /**
   * Get platform-specific configuration for cross-compilation
   */
  getCrossCompileEnv() {
    const env = { ...process.env };
    
    // Set target platform and architecture
    if (this.targetPlatform !== process.platform) {
      console.log(`  Cross-compiling for platform: ${this.targetPlatform}`);
    }
    if (this.targetArch !== process.arch) {
      console.log(`  Cross-compiling for architecture: ${this.targetArch}`);
    }
    
    // Map common arch names to node-gyp format
    const archMap = {
      'x64': 'x64',
      'ia32': 'ia32',
      'arm': 'arm',
      'arm64': 'arm64'
    };
    
    env.npm_config_target = this.targetNodeVersion;
    env.npm_config_arch = archMap[this.targetArch] || this.targetArch;
    env.npm_config_target_arch = archMap[this.targetArch] || this.targetArch;
    env.npm_config_disturl = 'https://nodejs.org/dist';
    env.npm_config_runtime = 'node';
    env.npm_config_build_from_source = 'true';
    
    return env;
  }

  /**
   * Rebuild a native module using node-gyp for the target platform
   */
  rebuildModule(modulePath, moduleName) {
    console.log(`\nRebuilding ${moduleName}...`);
    console.log(`  Path: ${modulePath}`);
    console.log(`  Target: Node.js ${this.targetNodeVersion} (${this.targetPlatform}-${this.targetArch})`);
    
    // Determine if we should use npx node-gyp or just node-gyp
    let useNpx = false;
    try {
      execSync('node-gyp --version', { stdio: 'pipe' });
    } catch (error) {
      useNpx = true;
    }
    
    const nodeGypCmd = useNpx ? 'npx node-gyp' : 'node-gyp';
    
    try {
      const env = this.getCrossCompileEnv();
      
      // Clean previous builds
      try {
        execSync(`${nodeGypCmd} clean`, {
          cwd: modulePath,
          stdio: 'pipe',
          env
        });
      } catch (cleanError) {
        // Ignore clean errors
      }
      
      // Configure for target
      const configureCmd = `${nodeGypCmd} configure --target=${this.targetNodeVersion} --arch=${this.targetArch} --dist-url=https://nodejs.org/dist`;
      execSync(configureCmd, {
        cwd: modulePath,
        stdio: 'inherit',
        env
      });
      
      // Build
      execSync(`${nodeGypCmd} build`, {
        cwd: modulePath,
        stdio: 'inherit',
        env
      });
      
      console.log(`✓ Successfully rebuilt ${moduleName}`);
      return true;
    } catch (error) {
      console.error(`✗ Failed to rebuild ${moduleName}:`, error.message);
      return false;
    }
  }

  /**
   * Main rebuild process
   */
  async rebuild() {
    console.log('Starting native module rebuild process...');
    console.log(`Build path: ${this.buildPath}`);
    console.log(`Target: Node.js ${this.targetNodeVersion} (${this.targetPlatform}-${this.targetArch})\n`);

    // Verify node-gyp is available
    try {
      execSync('node-gyp --version', { stdio: 'pipe' });
    } catch (error) {
      // Try with npx
      try {
        execSync('npx node-gyp --version', { stdio: 'pipe' });
      } catch (npxError) {
        console.error('Error: node-gyp is not installed or not in PATH');
        console.error('Install it with: npm install -g node-gyp');
        console.error('Or ensure it is in your project dependencies');
        process.exit(1);
      }
    }

    // Scan for native modules
    console.log('Scanning dependencies for native modules...\n');
    this.scanDependencies(this.buildPath);

    if (this.nativeModules.size === 0) {
      console.log('No native modules found.');
      return;
    }

    console.log(`Found ${this.nativeModules.size} native module(s) to rebuild.\n`);
    console.log('='.repeat(60));

    // Rebuild each native module
    let successCount = 0;
    let failCount = 0;

    for (const [modulePath, moduleName] of this.nativeModules) {
      const success = this.rebuildModule(modulePath, moduleName);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Rebuild Summary:');
    console.log(`  Total modules: ${this.nativeModules.size}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Failed: ${failCount}`);

    if (failCount > 0) {
      console.log('\nSome modules failed to rebuild. Check the errors above.');
      process.exit(1);
    } else {
      console.log('\n✓ All native modules rebuilt successfully!');
    }
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = {};
  let buildPath = process.cwd();
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--target' && args[i + 1]) {
      options.target = args[i + 1];
      i++;
    } else if (arg === '--node-version' && args[i + 1]) {
      options.nodeVersion = args[i + 1];
      i++;
    } else if (arg === '--platform' && args[i + 1]) {
      options.platform = args[i + 1];
      i++;
    } else if (arg === '--arch' && args[i + 1]) {
      options.arch = args[i + 1];
      i++;
    } else if (arg === '--current') {
      options.current = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
seabox-rebuild - Rebuild native modules for target Node.js version

Usage:
Options:
  --target <target>           Target in format: nodeX.Y.Z-platform-arch
                              Example: node24.11.0-win32-x64
  --node-version <version>    Target Node.js version (e.g., 24.11.0)
  --platform <platform>       Target platform (win32, linux, darwin)
  --arch <arch>               Target architecture (x64, arm64, ia32)
  --current                   Use the currently installed Node.js version
  --help, -h                  Show this help message

Examples:
  seabox-rebuild --current
  seabox-rebuild --target node24.11.0-win32-x64
  seabox-rebuild --node-version 24.11.0 --platform linux --arch x64
  seabox-rebuild /path/to/project11.0-win32-x64
  seabox-rebuild --node-version 24.11.0 --platform linux --arch x64
  seabox-rebuild /path/to/project
`);
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      buildPath = arg;
    }
  }
  
  const rebuilder = new NativeModuleRebuilder(buildPath, options);
  rebuilder.rebuild().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { NativeModuleRebuilder };
