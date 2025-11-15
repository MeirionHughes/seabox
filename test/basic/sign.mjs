/**
 * Mock signing script for testing
 * Writes signing config to a JSON file for verification
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function sign(config) {
  // Write the config to a file so tests can verify it
  const outputPath = path.join(__dirname, 'sign-output.json');
  
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), 'utf8');
  
  console.log('Mock signing called with config:', config);
}
