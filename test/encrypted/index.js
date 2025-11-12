#!/usr/bin/env node

/**
 * Encryption test entry file
 * This app reads encrypted assets and outputs their content for verification
 */

const APP_NAME = 'sea-encryption-test';
const VERSION = '1.0.0';

// SEA API
let sea = null;
try {
  sea = require('node:sea');
} catch (err) {
  console.error('Error: Not running in SEA context');
  process.exit(1);
}

function main() {
  console.log('=== SEA Encryption Test ===');
  console.log(`App: ${APP_NAME}`);
  console.log(`Version: ${VERSION}`);
  console.log(`Platform: ${process.platform}-${process.arch}`);
  console.log('');

  try {
    // Read the text file asset
    console.log('--- Reading assets/test-data.txt ---');
    const textData = sea.getAsset('assets/test-data.txt', 'utf8');
    console.log(textData);
    console.log('');

    // Read the JSON config file
    console.log('--- Reading assets/config.json ---');
    const configData = sea.getAsset('assets/config.json', 'utf8');
    const config = JSON.parse(configData);
    console.log('Config parsed successfully:');
    console.log(`  App Name: ${config.appName}`);
    console.log(`  Version: ${config.version}`);
    console.log(`  Secret Value: ${config.config.secretValue}`);
    console.log(`  Test Data Count: ${config.testData.length}`);
    console.log('');

    // Verify expected content
    let allVerified = true;

    if (!textData.includes('SEA_ENCRYPTION_TEST_VERIFIED')) {
      console.error('VERIFICATION FAILED: Missing expected marker in test-data.txt');
      allVerified = false;
    }

    if (!textData.includes('The quick brown fox')) {
      console.error('VERIFICATION FAILED: Missing expected content in test-data.txt');
      allVerified = false;
    }

    if (config.config.secretValue !== 'ENCRYPTED_CONFIG_DATA_12345') {
      console.error('VERIFICATION FAILED: Config secret value mismatch');
      allVerified = false;
    }

    if (config.testData.length !== 3) {
      console.error('VERIFICATION FAILED: Config test data count mismatch');
      allVerified = false;
    }

    if (allVerified) {
      console.log('=== All Asset Verifications PASSED ===');
      console.log('=== Test Successful ===');
      process.exit(0);
    } else {
      console.error('=== Asset Verifications FAILED ===');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error reading assets:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
