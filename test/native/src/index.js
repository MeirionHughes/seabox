// Load native addon using bindings package (real-world pattern)
const addon = require('bindings')('native_addon');

console.log('=== Native Module Test ===');
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Node Version:', process.version);
console.log();

// Test getMessage
const message = addon.getMessage();
console.log('getMessage():', message);

if (message === 'NATIVE_MODULE_TEST_SUCCESS') {
  console.log('✓ getMessage test PASSED');
} else {
  console.log('✗ getMessage test FAILED');
  process.exit(1);
}

// Test add
const sum = addon.add(10, 32);
console.log('add(10, 32):', sum);

if (sum === 42) {
  console.log('✓ add test PASSED');
} else {
  console.log('✗ add test FAILED');
  process.exit(1);
}

// Test getMagicNumber
const magic = addon.getMagicNumber();
console.log('getMagicNumber():', magic);

if (magic === 42) {
  console.log('✓ getMagicNumber test PASSED');
} else {
  console.log('✗ getMagicNumber test FAILED');
  process.exit(1);
}

console.log();
console.log('=== All Native Module Tests PASSED ===');
