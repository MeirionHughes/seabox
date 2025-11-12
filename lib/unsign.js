/**
 * unsign.js
 * Remove code signatures from executables before injection.
 * This prevents signature corruption during postject injection.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Check if a signing tool is available on the system.
 * @param {string} platform - Target platform (win32, linux, darwin)
 * @returns {Promise<{available: boolean, tool: string|null}>}
 */
async function checkSignToolAvailability(platform) {
  const tools = {
    win32: 'signtool.exe',
    darwin: 'codesign',
    linux: 'osslsigncode'
  };

  const tool = tools[platform];
  if (!tool) {
    return { available: false, tool: null };
  }

  try {
    // Try to execute the tool with a version/help flag to check availability
    if (platform === 'win32') {
      await execFileAsync('where', ['signtool.exe']);
    } else if (platform === 'darwin') {
      await execFileAsync('which', ['codesign']);
    } else if (platform === 'linux') {
      await execFileAsync('which', ['osslsigncode']);
    }
    return { available: true, tool };
  } catch (error) {
    return { available: false, tool };
  }
}

/**
 * Remove signature from a Windows executable using signtool.
 * @param {string} exePath - Path to the executable
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function removeWindowsSignature(exePath) {
  try {
    const { stdout, stderr } = await execFileAsync('signtool.exe', ['remove', '/s', exePath]);
    
    const output = (stdout + stderr).toLowerCase();
    
    // Check if successfully removed
    if (output.includes('successfully')) {
      return { success: true, message: 'Signature removed successfully' };
    }
    
    // Check if there was no signature
    if (output.includes('no signature') || output.includes('not signed')) {
      return { success: true, message: 'Binary was not signed (no signature to remove)' };
    }
    
    return { success: true, message: stdout || 'Signature removal completed' };
  } catch (error) {
    const errorMsg = error.message || error.stderr || '';
    
    // Not an error if there was no signature to begin with
    if (errorMsg.includes('No signature') || errorMsg.includes('not signed')) {
      return { success: true, message: 'Binary was not signed (no signature to remove)' };
    }
    
    return { success: false, message: `Failed to remove signature: ${errorMsg}` };
  }
}

/**
 * Remove signature from a macOS executable using codesign.
 * @param {string} exePath - Path to the executable
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function removeMacSignature(exePath) {
  try {
    // On macOS, use --remove-signature flag
    const { stdout, stderr } = await execFileAsync('codesign', ['--remove-signature', exePath]);
    
    return { success: true, message: 'Signature removed successfully' };
  } catch (error) {
    const errorMsg = error.message || error.stderr || '';
    
    // Not an error if there was no signature
    if (errorMsg.includes('not signed') || errorMsg.includes('no signature')) {
      return { success: true, message: 'Binary was not signed (no signature to remove)' };
    }
    
    return { success: false, message: `Failed to remove signature: ${errorMsg}` };
  }
}

/**
 * Remove signature from a Linux executable.
 * Note: Linux binaries are rarely signed, but osslsigncode can handle Authenticode signatures.
 * @param {string} exePath - Path to the executable
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function removeLinuxSignature(exePath) {
  try {
    // osslsigncode can remove Authenticode signatures (used for cross-platform PE files)
    const { stdout, stderr } = await execFileAsync('osslsigncode', ['remove-signature', exePath]);
    
    return { success: true, message: 'Signature removed successfully' };
  } catch (error) {
    const errorMsg = error.message || error.stderr || '';
    
    // Not an error if there was no signature
    if (errorMsg.includes('not signed') || errorMsg.includes('no signature')) {
      return { success: true, message: 'Binary was not signed (no signature to remove)' };
    }
    
    return { success: false, message: `Failed to remove signature: ${errorMsg}` };
  }
}

/**
 * Remove code signature from an executable before injection.
 * This is critical to prevent signature corruption during postject injection.
 * @param {string} exePath - Path to the executable
 * @param {string} platform - Target platform (win32, linux, darwin)
 * @returns {Promise<void>}
 */
async function removeSignature(exePath, platform) {
  //console.log('Checking for code signature removal tools...');
  
  const { available, tool } = await checkSignToolAvailability(platform);
  
  if (!available) {
    console.warn(`⚠️  Warning: Signature removal tool not found for ${platform}`);
    console.warn(`    Tool needed: ${tool || 'unknown'}`);
    console.warn(`    The binary may have an existing signature that will be corrupted during injection.`);
    
    if (platform === 'win32') {
      console.warn(`    Install Windows SDK to get signtool.exe`);
      console.warn(`    Download from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/`);
    } else if (platform === 'darwin') {
      console.warn(`    Install Xcode Command Line Tools to get codesign`);
      console.warn(`    Run: xcode-select --install`);
    } else if (platform === 'linux') {
      console.warn(`    Install osslsigncode: apt-get install osslsigncode (Debian/Ubuntu)`);
    }
    
    console.warn('');
    return;
  }
  
  console.log(`Found ${tool}, attempting to remove signature...`);
  
  let result;
  if (platform === 'win32') {
    result = await removeWindowsSignature(exePath);
  } else if (platform === 'darwin') {
    result = await removeMacSignature(exePath);
  } else if (platform === 'linux') {
    result = await removeLinuxSignature(exePath);
  } else {
    console.warn(`⚠️  Warning: Unsupported platform for signature removal: ${platform}`);
    return;
  }
  
  if (result.success) {
    console.log(`✓ ${result.message}`);
  } else {
    console.warn(`⚠️  Warning: ${result.message}`);
    console.warn(`    Continuing anyway, but the executable may have signature issues.`);
  }
}

module.exports = {
  removeSignature,
  checkSignToolAvailability,
  removeWindowsSignature,
  removeMacSignature,
  removeLinuxSignature
};
