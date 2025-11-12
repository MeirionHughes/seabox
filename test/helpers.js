const fs = require('fs');
const path = require('path');

// Global cleanup helper
function cleanTestArtifacts() {
  const testDir = path.join(__dirname, '.');
  
  if (!fs.existsSync(testDir)) return;

  const entries = fs.readdirSync(testDir);
  const testFolders = entries.filter(name => {
    const testPath = path.join(testDir, name);
    return fs.statSync(testPath).isDirectory() && !name.includes('node_modules');
  });

  for (const testFolder of testFolders) {
    const testPath = path.join(testDir, testFolder);
    
    // Clean dist, out, and temporary directories
    const dirsToClean = ['dist', 'out', '.sea-temp'];
    
    for (const dirName of dirsToClean) {
      const dirPath = path.join(testPath, dirName);
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }
}

// Export for use in tests if needed
module.exports = { cleanTestArtifacts };
