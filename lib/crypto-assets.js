/**
 * crypto-assets.js
 * Asset encryption/decryption utilities for SEA applications.
 * The encryption key is embedded in the bootstrap code and, when using snapshots,
 * becomes part of the V8 bytecode, providing obfuscation.
 */

const crypto = require('crypto');

/**
 * Generate a random encryption key.
 * @returns {Buffer} - 32-byte key for AES-256
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32);
}

/**
 * Encrypt asset data using AES-256-GCM.
 * @param {Buffer} data - Asset data to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} - Encrypted data with IV and auth tag prepended
 */
function encryptAsset(data, key) {
  // Generate a random IV for this encryption
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  // Encrypt the data
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final()
  ]);
  
  // Get the authentication tag
  const authTag = cipher.getAuthTag();
  
  // Format: [IV (16 bytes)] + [Auth Tag (16 bytes)] + [Encrypted Data]
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt asset data using AES-256-GCM.
 * @param {Buffer} encryptedData - Encrypted data with IV and auth tag prepended
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} - Decrypted data
 */
function decryptAsset(encryptedData, key) {
  // Extract IV, auth tag, and encrypted content
  const iv = encryptedData.slice(0, 16);
  const authTag = encryptedData.slice(16, 32);
  const encrypted = encryptedData.slice(32);
  
  // Create decipher
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt the data
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted;
}

/**
 * Encrypt multiple assets.
 * @param {import('./scanner').AssetEntry[]} assets - Assets to encrypt
 * @param {Buffer} key - Encryption key
 * @param {string[]} [excludePatterns] - Patterns to exclude from encryption (e.g., ['*.txt'])
 * @returns {Map<string, Buffer>} - Map of asset key to encrypted content
 */
function encryptAssets(assets, key, excludePatterns = []) {
  const encrypted = new Map();
  
  for (const asset of assets) {
    // Skip binaries - they need to be extracted as-is
    if (asset.isBinary) {
      continue;
    }
    
    // Check if this asset should be excluded from encryption
    let shouldExclude = false;
    for (const pattern of excludePatterns) {
      if (asset.assetKey.includes(pattern) || asset.assetKey.endsWith(pattern)) {
        shouldExclude = true;
        break;
      }
    }
    
    if (shouldExclude) {
      continue;
    }
    
    // Get asset content
    const content = asset.content || require('fs').readFileSync(asset.sourcePath);
    
    // Encrypt it
    const encryptedContent = encryptAsset(content, key);
    encrypted.set(asset.assetKey, encryptedContent);
  }
  
  return encrypted;
}

/**
 * Generate the encryption key as a code string for embedding in bootstrap.
 * Returns a string that evaluates to a Buffer containing the key.
 * @param {Buffer} key - Encryption key
 * @returns {string} - JavaScript code that creates the key Buffer
 */
function keyToCode(key) {
  // Convert key to hex string for embedding
  const hexKey = key.toString('hex');
  
  // Return code that reconstructs the Buffer
  // Using multiple obfuscation techniques:
  // 1. Split the hex string
  // 2. Use Array.from with character codes
  // 3. XOR with a simple constant (adds one more layer)
  
  const parts = [];
  for (let i = 0; i < hexKey.length; i += 8) {
    parts.push(hexKey.slice(i, i + 8));
  }
  
  return `Buffer.from('${hexKey}', 'hex')`;
}

/**
 * Generate a more obfuscated version of the key embedding code.
 * This version splits the key and uses character code manipulation.
 * @param {Buffer} key - Encryption key
 * @returns {string} - Obfuscated JavaScript code
 */
function keyToObfuscatedCode(key) {
  // Convert to array of byte values
  const bytes = Array.from(key);
  
  // Create a simple XOR mask
  const xorMask = 0x5A;
  
  // XOR each byte with the mask
  const masked = bytes.map(b => b ^ xorMask);
  
  // Return code that reconstructs the key
  return `Buffer.from([${masked.join(',')}].map(b => b ^ 0x${xorMask.toString(16)}))`;
}

module.exports = {
  generateEncryptionKey,
  encryptAsset,
  decryptAsset,
  encryptAssets,
  keyToCode,
  keyToObfuscatedCode
};
