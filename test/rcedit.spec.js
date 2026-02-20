import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyRcedit } from '../lib/inject.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('rcedit integration', function () {
  this.timeout(30000);

  it('should import rcedit as a named export function', async function () {
    const rceditModule = await import('rcedit');
    expect(rceditModule).to.have.property('rcedit');
    expect(rceditModule.rcedit).to.be.a('function');
  });

  it('should apply rcedit to a copy of the node binary', async function () {
    // Use a copy of the current node binary as a test .exe
    const tmpDir = path.join(__dirname, '.tmp-rcedit-test');
    const testExe = path.join(tmpDir, 'test-rcedit.exe');

    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    try {
      // Copy current node binary
      fs.copyFileSync(process.execPath, testExe);

      await applyRcedit(testExe, {
        'version-string': {
          ProductName: 'SeaboxTestProduct',
          FileDescription: 'Seabox rcedit test',
          CompanyName: 'TestCompany',
        },
        'file-version': '1.2.3.4',
        'product-version': '5.6.7.8',
      }, false);

      // If we get here, rcedit ran without error
      expect(fs.existsSync(testExe)).to.be.true;
    } finally {
      // Cleanup
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});
