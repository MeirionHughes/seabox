const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('SEA Builder - Asset Encryption', function() {
  this.timeout(60000);

  const testDir = path.join(__dirname, 'encrypted');
  const packageJsonPath = path.join(testDir, 'package.json');
  const distPath = path.join(testDir, 'dist');
  const seaBuildPath = path.join(__dirname, '../bin/seabox.js');

  // Ground truth data for verification
  const expectedTextContent = {
    marker: 'SEA_ENCRYPTION_TEST_VERIFIED',
    phrase: 'The quick brown fox',
    lines: [
      'Line 1: The quick brown fox jumps over the lazy dog',
      'Line 2: Asset encryption testing with AES-256-GCM'
    ]
  };

  const expectedConfigContent = {
    appName: 'encryption-test',
    secretValue: 'ENCRYPTED_CONFIG_DATA_12345',
    testDataCount: 3
  };

  beforeEach(function() {
    // Clean previous build
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
  });

  it('should have encryption enabled in test config', function() {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    expect(packageJson.seabox).to.have.property('encryptAssets');
    expect(packageJson.seabox.encryptAssets).to.be.true;
  });

  it('should build successfully with encryption enabled', function() {
    // Build
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Verify executable was created
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const outputPath = path.join(distPath, packageJson.seabox.output);
    expect(fs.existsSync(outputPath)).to.be.true;
  });

  it('should run encrypted executable and decrypt assets correctly', function() {
    // Build first
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const outputPath = path.join(testDir, 'dist', packageJson.seabox.output);

    // Run the executable
    const output = execSync(`"${outputPath}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });

    // Verify it contains the expected content from encrypted assets
    expect(output).to.include('SEA Encryption Test');
    expect(output).to.include('Test Successful');
    
    // Verify text file content was decrypted
    expect(output).to.include(expectedTextContent.marker);
    expect(output).to.include(expectedTextContent.phrase);
    
    // Verify config file was decrypted and parsed
    expect(output).to.include(expectedConfigContent.appName);
    expect(output).to.include(expectedConfigContent.secretValue);
    expect(output).to.include('All Asset Verifications PASSED');
  });

  it('should verify ground truth - text file content matches', function() {
    const textFilePath = path.join(testDir, 'assets', 'test-data.txt');
    const content = fs.readFileSync(textFilePath, 'utf8');
    
    // Verify ground truth
    expect(content).to.include(expectedTextContent.marker);
    expect(content).to.include(expectedTextContent.phrase);
    expectedTextContent.lines.forEach(line => {
      expect(content).to.include(line);
    });
  });

  it('should verify ground truth - config file content matches', function() {
    const configFilePath = path.join(testDir, 'assets', 'config.json');
    const content = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    
    // Verify ground truth
    expect(content.appName).to.equal(expectedConfigContent.appName);
    expect(content.config.secretValue).to.equal(expectedConfigContent.secretValue);
    expect(content.testData).to.have.length(expectedConfigContent.testDataCount);
  });

  it('should have encryption key embedded and obfuscated in bundled entry', function() {
    // Build first
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    const bundledEntryPath = path.join(testDir, 'out', '_sea-entry.js');
    
    expect(fs.existsSync(bundledEntryPath)).to.be.true;
    
    const content = fs.readFileSync(bundledEntryPath, 'utf8');
    
    // When encryption is enabled, bootstrap should ALWAYS be obfuscated
    // Verify obfuscation markers
    expect(content).to.match(/function\s+_0x[0-9a-f]+/); // Hex function names
    expect(content.length).to.be.greaterThan(1000); // Should be significantly larger when obfuscated
    
    // Original plain text should NOT be present
    expect(content).to.not.include('SEA_ENCRYPTION_KEY');
    expect(content).to.not.include('SEA_ENCRYPTED_ASSETS');
  });

  it('should not include plaintext encryption key in bundled entry', function() {
    const bundledEntryPath = path.join(testDir, 'out', '_sea-entry.js');
    const content = fs.readFileSync(bundledEntryPath, 'utf8');
    
    // Bootstrap is obfuscated, so XOR pattern should not be visible
    expect(content).to.not.match(/Buffer\.from\(\[.*\]\.map\(b => b \^ 0x[0-9a-f]+\)\)/);
    
    // Verify obfuscation
    expect(content).to.match(/function\s+_0x[0-9a-f]+/); // Hex identifiers
    // The key should not appear as a readable hex string
    expect(content).to.not.match(/[0-9a-f]{64}/); // 32-byte key as hex
  });

  it('should list encrypted assets in the bundled entry', function() {
    const bundledEntryPath = path.join(testDir, 'out', '_sea-entry.js');
    const content = fs.readFileSync(bundledEntryPath, 'utf8');
    
    // Should include the asset keys that are encrypted
    expect(content).to.include('assets/test-data.txt');
    expect(content).to.include('assets/config.json');
  });

  after(function() {
    // Clean up
    const outPath = path.join(testDir, 'out');
    
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    if (fs.existsSync(outPath)) {
      fs.rmSync(outPath, { recursive: true, force: true });
    }
  });
});
