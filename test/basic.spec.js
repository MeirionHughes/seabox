import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Seabox - ESM Architecture', function() {
  this.timeout(120000); // 2 minutes for build operations

  const testProjectDir = path.join(__dirname, 'basic');
  const configPath = path.join(testProjectDir, 'seabox.config.json');
  const srcDir = path.join(testProjectDir, 'src');
  const distDir = path.join(testProjectDir, 'dist');

  before(function() {
    // Create test project structure
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }
    if (!fs.existsSync(srcDir)) {
      fs.mkdirSync(srcDir, { recursive: true });
    }
    
    // Install dependencies in test project
    try {
      execSync('npm install', {
        cwd: testProjectDir,
        encoding: 'utf8',
        stdio: 'inherit'
      });
    } catch (error) {
      console.warn('npm install failed in test folder:', error.message);
    }
  });

  after(function() {
    // Cleanup
    const cleanupDirs = [
      path.join(testProjectDir, 'dist'),
      path.join(testProjectDir, 'out'),
      path.join(testProjectDir, '.seabox-cache')
    ];

    for (const dir of cleanupDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('should have configuration file', function() {
    expect(fs.existsSync(configPath)).to.be.true;
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config).to.have.property('entry');
    expect(config).to.have.property('outputs');
    expect(config.outputs).to.be.an('array').with.length.greaterThan(0);
  });

  it('should build executable using  CLI', function() {
    const seaboxPath = path.join(__dirname, '..', 'bin', 'seabox.mjs');
    expect(fs.existsSync(seaboxPath)).to.be.true;

    // Run the build
    try {
      const output = execSync(`node "${seaboxPath}" build`, {
        cwd: testProjectDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      console.log('Build output:', output);

      // Check that build completed
      expect(output).to.include('Build');
    } catch (error) {
      console.error('Build failed:', error.message);
      if (error.stdout) console.error('STDOUT:', error.stdout);
      if (error.stderr) console.error('STDERR:', error.stderr);
      throw error;
    }
  });

  it('should create bundled entry file', function() {
    const bundledEntry = path.join(testProjectDir, 'out', '_sea-entry.js');
    expect(fs.existsSync(bundledEntry)).to.be.true;

    const content = fs.readFileSync(bundledEntry, 'utf8');
    expect(content).to.include('Bundled by Seabox');
  });

  it('should create executable in dist directory', function() {
    const exePath = path.join(distDir, 'test.exe');
    expect(fs.existsSync(exePath)).to.be.true;

    const stats = fs.statSync(exePath);
    expect(stats.size).to.be.greaterThan(1024 * 1024); // At least 1MB
  });

  it('should run the built executable successfully', function() {
    const exePath = path.join(distDir, 'test.exe');
    
    try {
      const output = execSync(`"${exePath}"`, {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      console.log('Executable output:', output);

      // Verify output
      expect(output).to.include('Seabox Test');
      expect(output).to.include('Platform:');
      expect(output).to.include('Test Successful');
    } catch (error) {
      console.error('Execution failed:', error.message);
      if (error.stdout) console.error('STDOUT:', error.stdout);
      if (error.stderr) console.error('STDERR:', error.stderr);
      throw error;
    }
  });

  it('should support --verbose flag', function() {
    const seaboxPath = path.join(__dirname, '..', 'bin', 'seabox.mjs');
    
    // Clean dist to force rebuild
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }

    try {
      const output = execSync(`node "${seaboxPath}" build --verbose`, {
        cwd: testProjectDir,
        encoding: 'utf8',
        stdio: 'pipe'
      });

      expect(output).to.include('[Bundler]');
      expect(output).to.include('Bundle created');
    } catch (error) {
      console.error('Verbose build failed:', error.message);
      throw error;
    }
  });
});
