/**
 * crypto-assets.mjs
 * Asset encryption/decryption utilities for SEA applications.
 */

import crypto from 'crypto';
import fs from 'fs';

/**
 * Generate a random encryption key.
 * @returns {Buffer} - 32-byte key for AES-256
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32);
}

/**
 * Encrypt asset data using AES-256-GCM.
 * @param {Buffer} data - Asset data to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Buffer} - Encrypted data with IV and auth tag prepended
 */
export function encryptAsset(data, key) {
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
export function decryptAsset(encryptedData, key) {
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
 * @param {Array} assets - Assets to encrypt
 * @param {Buffer} key - Encryption key
 * @param {string[]} [excludePatterns] - Patterns to exclude from encryption
 * @returns {Map<string, Buffer>} - Map of asset key to encrypted content
 */
export function encryptAssets(assets, key, excludePatterns = []) {
  const encrypted = new Map();
  
  for (const asset of assets) {
    // Skip binaries
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
    const content = asset.content || fs.readFileSync(asset.sourcePath);
    
    // Encrypt it
    const encryptedContent = encryptAsset(content, key);
    encrypted.set(asset.assetKey, encryptedContent);
  }
  
  return encrypted;
}

/**
 * Generate a more obfuscated version of the key embedding code.
 * @param {Buffer} key - Encryption key
 * @returns {string} - Obfuscated JavaScript code
 */
export function keyToObfuscatedCode(key) {
  // Convert to array of byte values
  const bytes = Array.from(key);
  
  // Create a simple XOR mask
  const xorMask = 0x5A;
  
  // XOR each byte with the mask
  const masked = bytes.map(b => b ^ xorMask);
  
  // Return code that reconstructs the key
  return `Buffer.from([${masked.join(',')}].map(b => b ^ 0x${xorMask.toString(16)}))`;
}
