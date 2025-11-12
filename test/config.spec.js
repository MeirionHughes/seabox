const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

describe('SEA Builder - Configuration Validation', function() {
  const testDir = path.join(__dirname, 'basic');
  const packageJsonPath = path.join(testDir, 'package.json');

  it('should have valid package.json with SEA configuration', function() {
    expect(fs.existsSync(packageJsonPath)).to.be.true;
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson).to.have.property('seabox');
    expect(packageJson.seabox).to.be.an('object');
  });

  it('should have required SEA fields in configuration', function() {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const seaConfig = packageJson.seabox;

    expect(seaConfig).to.have.property('entry');
    expect(seaConfig).to.have.property('output');
    expect(seaConfig).to.have.property('targets');
    
    expect(seaConfig.entry).to.be.a('string');
    expect(seaConfig.output).to.be.a('string');
    expect(seaConfig.targets).to.be.an('array');
  });

  it('should have valid entry point file', function() {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const entryPath = path.join(testDir, packageJson.seabox.entry);
    
    expect(fs.existsSync(entryPath)).to.be.true;
    expect(fs.statSync(entryPath).isFile()).to.be.true;
  });

  it('should have at least one target platform', function() {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson.seabox.targets).to.have.length.greaterThan(0);
  });
});
