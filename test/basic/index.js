/**
 * Basic test entry file
 * This file outputs a testable result to verify the SEA build process
 */

const APP_NAME = 'seabox-test';
const VERSION = '1.0.0';

// SEA API
let sea = null;
try {
  sea = require('node:sea');
} catch (err) {
  // Not in SEA context
}

function main() {
  const timestamp = new Date().toISOString();
  
  console.log('=== SEA Builder Test ===');
  console.log(`App: ${APP_NAME}`);
  console.log(`Version: ${VERSION}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`Architecture: ${process.arch}`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Timestamp: ${timestamp}`);
  
  // Test asset inclusion/exclusion if in SEA context
  if (sea) {
    console.log('');
    console.log('--- Asset Inclusion/Exclusion Test ---');
    
    try {
      // Try to read included asset
      const configData = sea.getAsset('assets/config.json', 'utf8');
      console.log('✓ Included asset found: assets/config.json');
      const config = JSON.parse(configData);
      console.log(`  Config appName: ${config.appName}`);
    } catch (err) {
      console.log('✗ Failed to read included asset: assets/config.json');
      console.error(err.message);
    }
    
    // Try to read excluded asset - should fail
    let excludedFound = false;
    try {
      const excludedData = sea.getAsset('assets/excluded.txt', 'utf8');
      if (excludedData) {
        console.log('✗ EXCLUDED asset incorrectly included: assets/excluded.txt');
        console.log('EXCLUSION_TEST_FAILED');
        excludedFound = true;
      }
    } catch (err) {
      console.log('✓ Excluded asset correctly absent: assets/excluded.txt');
    }
    
    // Try to read excluded markdown - should fail
    let markdownFound = false;
    try {
      const mdData = sea.getAsset('assets/README.md', 'utf8');
      if (mdData) {
        console.log('✗ MARKDOWN asset incorrectly included: assets/README.md');
        console.log('EXCLUSION_TEST_FAILED');
        markdownFound = true;
      }
    } catch (err) {
      console.log('✓ Markdown asset correctly excluded: assets/README.md');
    }
    
    if (!excludedFound && !markdownFound) {
      console.log('EXCLUSION_TEST_PASSED');
    }
  }
  
  console.log('');
  console.log('=== Test Successful ===');
  
  // Exit with success code
  process.exit(0);
}

main();
