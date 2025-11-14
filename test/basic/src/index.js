
console.log('=== Seabox v2 Test ===');
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Node Version:', process.version);

// Test that we can import and use built-in modules
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Built-in modules working: ✓');

// Test that we can import and use built-in modules
import Database from 'better-sqlite3';
const db = new Database(':memory:', {});

db.close();

console.log('Native modules working: ✓');

// Test auto-detected asset (path.join(__dirname, ...))
const autoAssetPath = path.join(__dirname, '../assets/test-asset.txt');
try {
  const autoAssetContent = fs.readFileSync(autoAssetPath, 'utf8');
  console.log('Auto-detected asset loaded: ✓');
  console.log('  Content preview:', autoAssetContent.substring(0, 50));
} catch (err) {
  console.error('Auto-detected asset failed:', err.message);
  process.exit(1);
}

// Test config asset (from assets glob in config)
const configAssetPath = path.join(__dirname, '../data/config-asset.json');
try {
  const configAssetContent = fs.readFileSync(configAssetPath, 'utf8');
  const configData = JSON.parse(configAssetContent);
  console.log('Config asset loaded: ✓');
  console.log('  Message:', configData.message);
} catch (err) {
  console.error('Config asset failed:', err.message);
  process.exit(1);
}

// Test basic functionality
function add(a, b) {
  return a + b;
}

console.log("path is defined:", path != null)
console.log("fs is defined:", fs != null)

const result = add(5, 3);
console.log('Function test: 5 + 3 =', result);

if (result === 8) {
  console.log('=== Test Successful ===');
  process.exit(0);
} else {
  console.error('Test failed!');
  process.exit(1);
}
