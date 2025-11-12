# Testing Guide

## Running Tests

Run all tests:
```powershell
npm test
```

Run tests in watch mode:
```powershell
npm test -- --watch
```

Run specific test file:
```powershell
npm test -- test/basic.spec.js
```

Run with verbose output:
```powershell
npm test -- --reporter spec
```

## Test Structure

Tests use **Mocha** as the test runner and **Chai** for assertions.

### Test Files

- `test/**/*.spec.js` - Test specification files
- `test/helpers.js` - Shared test utilities
- `.mocharc.json` - Mocha configuration

### Writing New Tests

Create a new `*.spec.js` file in the `test/` directory:

```javascript
const { expect } = require('chai');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('Your Test Suite', function() {
  // Increase timeout for building executables
  this.timeout(60000);

  beforeEach(function() {
    // Setup before each test
  });

  afterEach(function() {
    // Cleanup after each test
  });

  it('should do something', function() {
    // Your test code
    expect(true).to.be.true;
  });
});
```

### Test Fixtures

Test fixtures are located in subdirectories under `test/`:
- `test/basic/` - Basic SEA build test with sample app

Each fixture directory contains:
- `package.json` - Configuration with SEA settings
- `index.js` - Test application entry point

### Cleanup

Test artifacts (dist folders, temporary files) are automatically cleaned up:
- After each test in the `afterEach` hook
- Manually using the cleanup helper from `test/helpers.js`

## Configuration

### Mocha Options (`.mocharc.json`)

```json
{
  "spec": "test/**/*.spec.js",    // Test file pattern
  "timeout": 60000,                // 60 second timeout
  "reporter": "spec",              // Spec reporter
  "color": true                    // Colored output
}
```

### Chai Assertions

Common assertion patterns:

```javascript
const { expect } = require('chai');

// Equality
expect(value).to.equal(expected);
expect(value).to.deep.equal(object);

// Existence
expect(value).to.exist;
expect(value).to.be.null;
expect(value).to.be.undefined;

// Booleans
expect(value).to.be.true;
expect(value).to.be.false;

// Strings
expect(string).to.include('substring');
expect(string).to.match(/regex/);

// Numbers
expect(number).to.be.greaterThan(5);
expect(number).to.be.lessThan(10);

// Files
expect(fs.existsSync(path)).to.be.true;
```

## Continuous Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test
```

## Troubleshooting

### Tests timing out
- Increase timeout in `.mocharc.json` or per-suite with `this.timeout(ms)`

### Build artifacts not cleaned
- Ensure `afterEach` hooks are running
- Manually clean with helper: `cleanTestArtifacts()`

### Path issues on Windows
- Use `path.join()` for cross-platform compatibility
- Quote executable paths when using `execSync`
