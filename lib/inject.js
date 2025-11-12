/**
 * inject.js
 * Inject SEA blob into Node binary using postject.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { removeSignature } = require('./unsign');

const execFileAsync = promisify(execFile);

/**
 * Inject a SEA blob into a Node.js binary using postject.
 * @param {string} nodeBinaryPath - Path to the source Node binary
 * @param {string} blobPath - Path to the SEA blob file
 * @param {string} outputPath - Path for the output executable
 * @param {string} platform - Target platform (win32, linux, darwin)
 * @returns {Promise<void>}
 */
async function injectBlob(nodeBinaryPath, blobPath, outputPath, platform, verbose) {
  // Copy node binary to output location
  fs.copyFileSync(nodeBinaryPath, outputPath);

  // Remove existing signature before postject injection
  // The downloaded Node.js binary is signed, and postject will corrupt this signature
  await removeSignature(outputPath, platform);

  // Prepare postject command
  const sentinel = 'NODE_SEA_BLOB';
  const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

  const args = [
    outputPath,
    sentinel,
    blobPath,
    '--sentinel-fuse', sentinelFuse
  ];

  // Platform-specific postject options
  if (platform === 'darwin') {
    args.push('--macho-segment-name', 'NODE_SEA');
  }

  console.log(`Injecting SEA blob into: ${outputPath}`);
  
  // Use cmd.exe on Windows to run npx
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'cmd.exe' : 'npx';
  const cmdArgs = isWindows 
    ? ['/c', 'npx', 'postject', ...args]
    : ['postject', ...args];

  //console.log(`Command: ${command} ${cmdArgs.join(' ')}`);

  try {
    const { stdout, stderr } = await execFileAsync(command, cmdArgs);
    if (stdout && verbose) console.log(stdout);
    if (stderr && verbose) console.error(stderr);
    console.log('✓ SEA blob injected successfully');
  } catch (error) {
    throw new Error(`Postject injection failed: ${error.message}`);
  }

  //console.log('\nNote: Executable is now ready for signing with your certificate');
}

/**
 * Resolve the postject executable path.
 * @returns {string}
 */
function resolvePostject() {
  // Use npx to run postject
  return 'npx';
}

module.exports = {
  injectBlob,
  resolvePostject
};
