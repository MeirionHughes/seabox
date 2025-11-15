/**
 * diagnostics.mjs
 * Centralized console output formatting for CLI tooling.
 * Provides consistent formatting, indentation, and styling.
 */

/**
 * Output levels
 */
export const Level = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  SUCCESS: 'success',
  VERBOSE: 'verbose'
};

/**
 * Formatting utilities
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function withColor(text, color) {
  return `${color}${text}${colors.reset}`;
}

/**
 * Global verbose flag
 */
let verboseEnabled = false;

/**
 * Enable or disable verbose output
 * @param {boolean} enabled
 */
export function setVerbose(enabled) {
  verboseEnabled = enabled;
}

/**
 * Core logging function
 * @param {string} message
 * @param {string} prefix
 * @param {number} indent
 */
function log(message, prefix = '', indent = 0) {
  const indentation = '  '.repeat(indent);
  console.log(`${indentation}${prefix}${message}`);
}

/**
 * Print section header
 * @param {string} title
 */
export function header(title) {
  console.log(`\n${title}`);
  console.log('='.repeat(40));
}

/**
 * Print sub-header
 * @param {string} title
 */
export function subheader(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(40));
}

/**
 * Print step with number
 * @param {number} step
 * @param {number} total
 * @param {string} message
 */
export function step(step, total, message) {
  log(`[${step}/${total}] ${message}`);
}

/**
 * Print build step
 * @param {number} buildNum
 * @param {number} stepNum
 * @param {string} message
 */
export function buildStep(buildNum, stepNum, message) {
  log(`[${buildNum}.${stepNum}] ${message}`, '', 1);
}

/**
 * Print success message
 * @param {string} message
 * @param {number} indent
 */
export function success(message, indent = 1) {
  log(withColor(`[✓] ${message}`, colors.green), '', indent);
}

/**
 * Print info message
 * @param {string} message
 * @param {number} indent
 */
export function info(message, indent = 0) {
  log(message, '', indent);
}

/**
 * Print warning
 * @param {string} message
 * @param {number} indent
 */
export function warn(message, indent = 1) {
  log(withColor(`[!] ${message}`, colors.yellow), '', indent);
}

/**
 * Print error
 * @param {string} message
 * @param {number} indent
 */
export function error(message, indent = 0) {
  console.error(`${'  '.repeat(indent)}${withColor(`[X] ${message}`, colors.red)}`);
}

/**
 * Print verbose message (only if verbose enabled)
 * @param {string} message
 * @param {number} indent
 */
export function verbose(message, indent = 2) {
  if (verboseEnabled) {
    log(withColor(message, colors.gray), '', indent);
  }
}

/**
 * Print list item
 * @param {string} message
 * @param {number} indent
 */
export function listItem(message, indent = 1) {
  log(`- ${message}`, '', indent);
}

/**
 * Print numbered list item
 * @param {number} num
 * @param {string} message
 * @param {number} indent
 */
export function numberedItem(num, message, indent = 1) {
  log(`${num}. ${message}`, '', indent);
}

/**
 * Print section separator
 */
export function separator() {
  console.log('');
}

/**
 * Print final summary
 * @param {string} message
 */
export function summary(message) {
  console.log('');
  console.log('='.repeat(40));
  log(withColor(message, colors.green));
  console.log('='.repeat(40));
  console.log('');
}

/**
 * Format file size in human-readable format
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

/**
 * Format target string
 * @param {string} platform
 * @param {string} arch
 * @returns {string}
 */
export function formatTarget(platform, arch) {
  return `${platform}-${arch}`;
}
