const { expect } = require('chai');
const { scanAssets } = require('../lib/scanner');
const fs = require('fs');
const path = require('path');

describe('SEA Builder - Negative Glob Patterns', function() {
  const testDir = path.join(__dirname, 'glob-test');
  
  before(function() {
    // Create test directory structure
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(testDir, 'test'), { recursive: true });
    
    // Create test files
    fs.writeFileSync(path.join(testDir, 'src', 'app.js'), '// app');
    fs.writeFileSync(path.join(testDir, 'src', 'config.json'), '{}');
    fs.writeFileSync(path.join(testDir, 'docs', 'README.md'), '# Docs');
    fs.writeFileSync(path.join(testDir, 'test', 'test.js'), '// test');
    fs.writeFileSync(path.join(testDir, 'LICENSE'), 'MIT');
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}');
  });

  after(function() {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should support negative glob patterns with ! prefix', async function() {
    const patterns = [
      './**/*',
      '!**/test/**',
      '!**/*.md',
      '!**/LICENSE'
    ];

    const assets = await scanAssets(patterns, [], [], testDir);
    const assetKeys = assets.map(a => a.assetKey);

    // Should include
    expect(assetKeys).to.include('src/app.js');
    expect(assetKeys).to.include('src/config.json');
    expect(assetKeys).to.include('package.json');

    // Should exclude
    expect(assetKeys).to.not.include('docs/README.md');
    expect(assetKeys).to.not.include('test/test.js');
    expect(assetKeys).to.not.include('LICENSE');
  });

  it('should combine negative globs with positive patterns', async function() {
    const patterns = [
      './src/**/*',
      './docs/**/*',
      '!**/*.md'
    ];

    const assets = await scanAssets(patterns, [], [], testDir);
    const assetKeys = assets.map(a => a.assetKey);

    // Should include from src
    expect(assetKeys).to.include('src/app.js');
    expect(assetKeys).to.include('src/config.json');

    // Should exclude .md files
    expect(assetKeys).to.not.include('docs/README.md');
  });

  it('should work with legacy exclude parameter', async function() {
    const patterns = ['./**/*'];
    const exclude = ['**/test/**', '**/*.md'];

    const assets = await scanAssets(patterns, [], exclude, testDir);
    const assetKeys = assets.map(a => a.assetKey);

    // Should exclude based on legacy parameter
    expect(assetKeys).to.not.include('docs/README.md');
    expect(assetKeys).to.not.include('test/test.js');
  });

  it('should combine negative globs with legacy exclude', async function() {
    const patterns = [
      './**/*',
      '!**/LICENSE'
    ];
    const exclude = ['**/test/**'];

    const assets = await scanAssets(patterns, [], exclude, testDir);
    const assetKeys = assets.map(a => a.assetKey);

    // Should exclude from both sources
    expect(assetKeys).to.not.include('LICENSE');
    expect(assetKeys).to.not.include('test/test.js');

    // Should still include others
    expect(assetKeys).to.include('src/app.js');
  });

  it('should handle multiple negative patterns', async function() {
    const patterns = [
      './**/*',
      '!**/*.md',
      '!**/*.json',
      '!**/test/**'
    ];

    const assets = await scanAssets(patterns, [], [], testDir);
    const assetKeys = assets.map(a => a.assetKey);

    // Should only include .js files outside test
    expect(assetKeys).to.include('src/app.js');
    
    // Should exclude everything else
    expect(assetKeys).to.not.include('src/config.json');
    expect(assetKeys).to.not.include('package.json');
    expect(assetKeys).to.not.include('docs/README.md');
    expect(assetKeys).to.not.include('test/test.js');
  });
});
