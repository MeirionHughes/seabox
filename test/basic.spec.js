const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

describe('SEA Builder - Basic Test', function() {
  // Increase timeout for building executables
  this.timeout(60000);

  const testDir = path.join(__dirname, 'basic');
  const distPath = path.join(testDir, 'dist');
  const packageJsonPath = path.join(testDir, 'package.json');
  const seaBuildPath = path.join(__dirname, '../bin/seabox.js');
  
  let packageJson;
  let outputPath;

  before(function() {
    // Read package.json to get expected output name
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const outputName = packageJson.seabox?.output || 'app.exe';
    outputPath = path.join(distPath, outputName);
  });

  beforeEach(function() {
    // Clean previous build
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
  });

  after(function() {
    // Clean up after all tests
    if (fs.existsSync(distPath)) {
      fs.rmSync(distPath, { recursive: true, force: true });
    }
  });

  it('should successfully build an executable', function() {
    const buildCommand = `node "${seaBuildPath}"`;
    
    // Run the build
    const output = execSync(buildCommand, {
      cwd: testDir,
      encoding: 'utf8'
    });


    // Verify executable was created
    expect(fs.existsSync(outputPath)).to.be.true;
    expect(fs.statSync(outputPath).isFile()).to.be.true;
  });

  it('should create an executable that runs successfully', function() {
    // Build the executable
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Run the executable
    const output = execSync(`"${outputPath}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });


    // Verify output contains expected content
    expect(output).to.include('SEA Builder Test');
    expect(output).to.include('Test Successful');
  });

  it('should include correct platform information in executable output', function() {
    // Build the executable
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Run the executable
    const output = execSync(`"${outputPath}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });

    // Verify platform-specific information is present
    expect(output).to.include('Platform:');
    expect(output).to.include('Architecture:');
    expect(output).to.include('Node Version:');
  });

  it('should create executable with correct configuration', function() {
    // Build the executable
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Verify the executable file exists and has reasonable size
    const stats = fs.statSync(outputPath);
    expect(stats.size).to.be.greaterThan(1000000); // At least 1MB (Node binary)
  });

  it('should exclude files based on negative glob patterns', function() {
    // Build the executable
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    // Run the executable
    const output = execSync(`"${outputPath}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });

    // Verify inclusion test passed
    expect(output).to.include('Included asset found: assets/config.json');
    
    // Verify exclusion test passed
    expect(output).to.include('EXCLUSION_TEST_PASSED');
    expect(output).to.include('Excluded asset correctly absent: assets/excluded.txt');
    expect(output).to.include('Markdown asset correctly excluded: assets/README.md');
    
    // Make sure excluded files were not included
    expect(output).to.not.include('EXCLUSION_TEST_FAILED');
    expect(output).to.not.include('EXCLUDED_FILE_MARKER');
    expect(output).to.not.include('MARKDOWN_EXCLUDE_MARKER');
  });

  it('should verify exclusion files exist in source but not in executable', function() {
    // Verify excluded files exist in source
    const excludedFilePath = path.join(testDir, 'assets', 'excluded.txt');
    const markdownFilePath = path.join(testDir, 'assets', 'README.md');
    
    expect(fs.existsSync(excludedFilePath)).to.be.true;
    expect(fs.existsSync(markdownFilePath)).to.be.true;
    
    // Verify they contain the markers
    const excludedContent = fs.readFileSync(excludedFilePath, 'utf8');
    const markdownContent = fs.readFileSync(markdownFilePath, 'utf8');
    
    expect(excludedContent).to.include('EXCLUDED_FILE_MARKER');
    expect(markdownContent).to.include('MARKDOWN_EXCLUDE_MARKER');
    
    // Build and run the executable
    execSync(`node "${seaBuildPath}"`, {
      cwd: testDir,
      stdio: 'pipe'
    });

    const output = execSync(`"${outputPath}"`, {
      cwd: testDir,
      encoding: 'utf8'
    });

    // Verify the markers are NOT in the executable output
    expect(output).to.not.include('EXCLUDED_FILE_MARKER');
    expect(output).to.not.include('MARKDOWN_EXCLUDE_MARKER');
  });
});
