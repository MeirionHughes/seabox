const { expect } = require('chai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('SEA Builder - Native Module Test', function() {
  this.timeout(120000); // 2 minutes for compilation

  const testDir = path.join(__dirname, 'native');
  const packageJsonPath = path.join(testDir, 'package.json');
  const distPath = path.join(testDir, 'dist');
  const seaBuildPath = path.join(__dirname, '../bin/seabox.js');
  const seaRebuildPath = path.join(__dirname, '../bin/seabox-rebuild.js');
  const buildPath = path.join(testDir, 'build');

  let packageJson;
  let outputPath;

  before(function() {
    // Read package.json to get expected output name
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const outputName = packageJson.seabox?.output || 'native-test.exe';
    outputPath = path.join(distPath, outputName);
  });

  beforeEach(function() {
    // Clean previous builds
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    if (fs.existsSync(buildPath)) {
      fs.rmSync(buildPath, { recursive: true, force: true });
    }
  });

  it('should have node-api-headers installed', function() {
    // Check if node-api-headers is available
    try {
      require.resolve('node-api-headers');
    } catch (err) {
      this.skip('node-api-headers not installed - run: npm install --save-dev node-api-headers');
    }
  });

  it('should rebuild native module for target version', function() {
    // Get the target from package.json
    const target = packageJson.seabox.targets[0];
    
    console.log(`\n  Rebuilding native module for ${target}...`);
    
    // Run seabox-rebuild
    const output = execSync(`node "${seaRebuildPath}" --target ${target} "${testDir}"`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    // Verify the native module was built
    const nativeModulePath = path.join(testDir, 'build', 'Release', 'native_addon.node');
    expect(fs.existsSync(nativeModulePath)).to.be.true;
    
    // Verify it's a binary file
    const stats = fs.statSync(nativeModulePath);
    expect(stats.size).to.be.greaterThan(1000);
  });

  it('should run native module locally', function() {
    // Build first if not already built
    const nativeModulePath = path.join(testDir, 'build', 'Release', 'native_addon.node');
    if (!fs.existsSync(nativeModulePath)) {
      const target = packageJson.seabox.targets[0];
      execSync(`node "${seaRebuildPath}" --target ${target} "${testDir}"`, {
        stdio: 'pipe'
      });
    }

    // Build the bundle
    execSync('npm run build', {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Run the bundled test
    const output = execSync(`node "${path.join(testDir, 'out', 'index.js')}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });

    console.log(output);

    expect(output).to.include('NATIVE_MODULE_TEST_SUCCESS');
    expect(output).to.include('All Native Module Tests PASSED');
  });

  it('should build SEA executable with native module using rebuild option', function() {
    console.log('\n  Building SEA with automatic rebuild...');

    // Build SEA with rebuild option enabled (it will rebuild automatically)
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Verify executable was created
    expect(fs.existsSync(outputPath)).to.be.true;
    
    const stats = fs.statSync(outputPath);
    expect(stats.size).to.be.greaterThan(1000000); // At least 1MB

    // Verify native module was built
    const nativeModulePath = path.join(testDir, 'build', 'Release', 'native_addon.node');
    expect(fs.existsSync(nativeModulePath)).to.be.true;
  });

  it('should run SEA executable and use native module', function() {
    // Build everything if not already built
    const nativeModulePath = path.join(testDir, 'build', 'Release', 'native_addon.node');
    if (!fs.existsSync(nativeModulePath)) {
      const target = packageJson.seabox.targets[0];
      execSync(`node "${seaRebuildPath}" --target ${target} "${testDir}"`, {
        stdio: 'pipe'
      });
    }

    if (!fs.existsSync(outputPath)) {
      execSync(`node "${seaBuildPath}"`, {
        cwd: testDir,
        stdio: 'pipe'
      });
    }

    console.log('\n  Running SEA executable...');

    // Run the executable
    const output = execSync(`"${outputPath}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });

    console.log(output);

    // Verify native module functions work
    expect(output).to.include('Native Module Test');
    expect(output).to.include('NATIVE_MODULE_TEST_SUCCESS');
    expect(output).to.include('getMessage test PASSED');
    expect(output).to.include('add test PASSED');
    expect(output).to.include('getMagicNumber test PASSED');
    expect(output).to.include('All Native Module Tests PASSED');
  });

  it('should verify native module was extracted to cache', function() {
    // Run executable if not already run
    if (!fs.existsSync(outputPath)) {
      const target = packageJson.seabox.targets[0];
      execSync(`node "${seaRebuildPath}" --target ${target} "${testDir}"`, {
        stdio: 'pipe'
      });
      execSync(`node "${seaBuildPath}"`, {
        cwd: testDir,
        stdio: 'pipe'
      });
      execSync(`"${outputPath}"`, {
        cwd: testDir,
        stdio: 'pipe'
      });
    }

    // Check cache directory
    const localAppData = process.env.LOCALAPPDATA || process.env.HOME;
    const cachePath = path.join(localAppData, '.sea-cache', 'seabox-native-test');
    
    expect(fs.existsSync(cachePath)).to.be.true;

    // Find the version-platform-arch directory
    const cacheDirs = fs.readdirSync(cachePath);
    expect(cacheDirs.length).to.be.greaterThan(0);

    const versionDir = cacheDirs[0];
    // The native module is extracted directly to the cache directory
    const extractedModulePath = path.join(cachePath, versionDir, 'native_addon.node');
    
    expect(fs.existsSync(extractedModulePath)).to.be.true;
  });
});
