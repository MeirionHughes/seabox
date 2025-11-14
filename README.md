# seabox

A reusable tool for building Node.js Single Executable Applications (SEA) with native-module support.

## Features

- Bundle Node.js applications into standalone executables
- **Automatic asset detection** from `path.join(__dirname, ...)` patterns
- **Automatic native module detection** (.node files) with pattern transforms
- Platform-specific library extraction (DLLs, shared libraries)
- Asset encryption with obfuscated keys
- Multi-platform targeting (Windows, Linux, macOS)
- V8 snapshot support for faster startup
- Integrity checking for extracted binaries
- Automatic code signature removal before injection
- Simple configuration via `seabox.config.json`

## Use case
This tooling was created as an alternative to pkg, which is unfortunatly deprecated, and where forks were running foul of virus checkers. By using node's SEA, the executables are directly from nodejs's distribution source, and built using node's native Single Executable Application solution. Unfortunatly this does mean native modules embedded within the exe cannot run directly and must be extracted to a location on the disk on first run - This tooling automates that process for you, while providing arbitrary asset embedding. Embedded assets are _not_ extracted and access to them is handled by intercepting require and fs.  

Note: **V8 snapshot includes and embedds the original source**, this is currently a limitation of Node's SEA tooling as far as I can tell; thus the snapshot is only useful for faster startup.  

## Installation

```bash
npm install --save-dev seabox
```

## Configuration

Create a `seabox.config.json` file in your project root:

```json
{
  "entry": "./src/index.js",
  "outputs": [
    {
      "path": "./dist/win",
      "target": "node24.11.0-win32-x64",
      "output": "myapp.exe"
    }
  ],
  "bundler": {
    "external": []
  },
  "encryptAssets": false,
  "useSnapshot": true,
  "verbose": false
}
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `entry` | `string` | Yes | Path to your application's entry point |
| `outputs` | `array` | Yes | Array of build targets |
| `outputs[].path` | `string` | Yes | Output directory for this target |
| `outputs[].target` | `string` | Yes | Build target (format: `nodeX.Y.Z-platform-arch`) |
| `outputs[].output` | `string` | Yes | Output filename |
| `outputs[].libraries` | `array` | No | Glob patterns for shared libraries (DLLs/SOs) requiring filesystem extraction (defaults: `**/*.dll` for Windows, `**/*.so*` for Linux, `**/*.dylib` for macOS) |
| `outputs[].rcedit` | `object` | No | Windows executable metadata (icon, version info) |
| `assets` | `array` | No | Glob patterns for assets to embed (merged with auto-detected assets) |
| `bundler` | `object` | No | Bundler options |
| `bundler.external` | `array` | No | Modules to exclude from bundling |
| `bundler.plugins` | `array` | No | Additional Rollup plugins |
| `bundler.minify` | `boolean` | No | Minify bundled code |
| `bundler.sourcemap` | `boolean` | No | Generate source maps |
| `encryptAssets` | `boolean` | No | Enable asset encryption (default: false) |
| `encryptExclude` | `array` | No | Glob patterns to exclude from encryption |
| `useSnapshot` | `boolean` | No | Enable V8 startup snapshots (default: true) |
| `useCodeCache` | `boolean` | No | Enable V8 code cache (default: false) |
| `cacheLocation` | `string` | No | Path for code cache storage |
| `verbose` | `boolean` | No | Enable verbose logging (default: false) |

## Usage

### CLI Commands

```bash
# Build executable(s)
npx seabox build

# Build with verbose output
npx seabox build --verbose

# Specify custom config file
npx seabox build --config custom-config.json

# Initialize a new config file
npx seabox init

# Show help
npx seabox help
```

### npm Scripts (Recommended)

Add to your `package.json`:

```json
{
  "scripts": {
    "build": "seabox build",
    "build:verbose": "seabox build --verbose"
  }
}
```

Then run:

```bash
npm run build
```

### Programmatic API

```javascript
import { build } from 'seabox';

await build({
  projectRoot: process.cwd(),
  verbose: true
});
```

## How It Works

seabox automates the entire SEA build process:

1. **Bundling** - Automatically bundles your app with Rollup, detecting:
   - Native module patterns (`bindings`, `node-gyp-build`, direct `.node` requires)
   - Asset references via `path.join(__dirname, 'relative/path')`

2. **Asset Collection** - Gathers assets from three sources:
   - **Auto-detected**: Files referenced via `path.join(__dirname, ...)` patterns
   - **Config globs**: Patterns specified in `assets` array
   - **Libraries**: Platform-specific shared libraries (DLLs/SOs)

3. **Native Module Rebuilding** - Rebuilds native modules for target platform

4. **Bootstrap Injection** - Adds runtime code for asset loading and native module extraction

5. **SEA Blob Creation** - Packages everything using Node.js SEA tooling

6. **Binary Preparation** - Downloads target Node.js binary and removes code signature

7. **Injection** - Uses `postject` to inject the blob into the Node.js binary

8. **Output** - Produces standalone executable(s) ready for distribution

### Automatic Asset Detection

**Like pkg**, seabox automatically detects and embeds assets referenced in your code:

```javascript
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This asset will be automatically detected and embedded
const configPath = path.join(__dirname, '../config/app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
```

**Detection works with:**
- `path.join(__dirname, 'relative/path')`
- `path.resolve(__dirname, 'relative/path')`
- Multiple path segments: `path.join(__dirname, '..', 'assets', 'file.txt')`

**Asset sources (merged and deduplicated):**
1. **Auto-detected** from code analysis during bundling
2. **Config globs** from `assets: ["./data/**/*", "./public/**/*"]`
3. **Platform libraries** from `outputs[].libraries` (e.g., DLLs for Windows)

### Native Module Support

seabox automatically handles native modules without any configuration:

**Supported patterns:**
- `require('bindings')('module')` - Standard bindings package
- `require('./build/Release/addon.node')` - Direct requires
- `require('node-gyp-build')(__dirname)` - Prebuild binaries
- `require('node-pre-gyp')` patterns - Pre-compiled binaries

**At runtime:**
- Native modules are extracted to a cache directory on first run
- Modules are integrity-checked with SHA-256 hashes
- Custom `require()` shim loads modules from cache
- Works transparently with packages like `better-sqlite3`, `sharp`, `canvas`, etc.

**Cache directory:** `.seabox-cache/<platform>-<arch>/`

### Platform-Specific Libraries

Libraries that require filesystem access (like DLLs that are loaded via `dlopen`) can be specified with glob patterns:

```json
{
  "outputs": [
    {
      "target": "node24.11.0-win32-x64",
      "libraries": ["**/*.dll"]  // Auto-extracted at runtime
    }
  ]
}
```

**Defaults by platform:**
- **Windows**: `**/*.dll`
- **Linux**: `**/*.so`, `**/*.so.*`
- **macOS**: `**/*.dylib`

These files are extracted on first run (like `.node` files) since they need to be loaded from the filesystem.

### Code Signature Removal

Required before SEA injection. Platform-specific tools needed:
- **Windows**: `signtool.exe` (from Windows SDK)
- **macOS**: `codesign` (included with Xcode)
- **Linux**: Not required

## Asset Encryption

seabox supports optional AES-256-GCM encryption of embedded assets to protect your application code and data:

```json
{
  "sea": {
    "encryptAssets": true,
    "encryptExclude": ["*.txt", "public/*"],
    "useSnapshot": true
  }
}
```

### How Encryption Works

1. **Build Time**: A random 256-bit encryption key is generated
2. **Asset Encryption**: Non-binary assets are encrypted using AES-256-GCM
3. **Key Embedding**: The encryption key is obfuscated and embedded in the bootstrap code
4. **Key Obfuscation**: the bootstrap and key code are obfuscated, but not removed 
5. **Runtime Decryption**: Assets are transparently decrypted when accessed

### Considerations

- **Binary files** (`.node`, `.dll`, `.so`, `.dylib`) are **never encrypted** as they must be extracted as-is
- The manifest (`sea-manifest.json`) is **not encrypted** to allow bootstrap initialization
- **V8 snapshot includes the original source**, this is currently a limitation of Node's SEA. 
- Encryption provides **obfuscation**, not cryptographic security against determined attackers
- The bootloader code, that includes the encryption key, is obfuscated in the source embedded by Node's SEA
  

## Platform Support

- **Windows**: `win32-x64`, `win32-arm64`
- **Linux**: `linux-x64`, `linux-arm64`
- **macOS**: `darwin-x64`, `darwin-arm64`

## License

MIT
Copyright Meirion Hughes 2025
## Examples

### Basic Application

```javascript
// src/index.js
console.log('Hello from SEA!');
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
```

```json
// seabox.config.json
{
  "entry": "./src/index.js",
  "outputs": [
    {
      "path": "./dist",
      "target": "node24.11.0-win32-x64",
      "output": "hello.exe"
    }
  ]
}
```

### With Assets (Auto-Detection)

```javascript
// src/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Assets referenced via path.join(__dirname, ...) are auto-detected
const configPath = path.join(__dirname, '../config/settings.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('Config loaded:', config);
```

No configuration needed - the asset is automatically detected and embedded!

### With Config Assets

```json
{
  "entry": "./src/index.js",
  "outputs": [
    {
      "path": "./dist",
      "target": "node24.11.0-win32-x64",
      "output": "myapp.exe"
    }
  ],
  "assets": [
    "./public/**/*",
    "./data/**/*.json",
    "!**/*.md"
  ]
}
```

All files matching the glob patterns will be embedded. Auto-detected assets are merged automatically.

### With Native Modules

```javascript
// src/index.js
import Database from 'better-sqlite3';

const db = new Database(':memory:');
db.exec('CREATE TABLE users (name TEXT)');
db.prepare('INSERT INTO users VALUES (?)').run('Alice');

const users = db.prepare('SELECT * FROM users').all();
console.log('Users:', users);

db.close();
```

No special configuration needed - seabox automatically detects and handles the native module!

### Multi-Platform Build

```json
{
  "entry": "./src/index.js",
  "outputs": [
    {
      "path": "./dist/win",
      "target": "node24.11.0-win32-x64",
      "output": "myapp.exe"
    },
    {
      "path": "./dist/linux",
      "target": "node24.11.0-linux-x64",
      "output": "myapp"
    },
    {
      "path": "./dist/macos",
      "target": "node24.11.0-darwin-arm64",
      "output": "myapp"
    }
  ],
  "bundler": {
    "external": []
  },
  "useSnapshot": true
}
```

Run `seabox build` and get executables for all three platforms!

## Advanced Features

### Asset Encryption

Protect your source code with AES-256-GCM encryption:

```json
{
  "entry": "./src/index.js",
  "outputs": [
    {
      "path": "./dist",
      "target": "node24.11.0-win32-x64",
      "output": "myapp.exe"
    }
  ],
  "encryptAssets": true,
  "encryptExclude": ["*.txt"]
}
```

### External Dependencies

Exclude packages from bundling:

```json
{
  "entry": "./src/index.js",
  "outputs": [
    {
      "path": "./dist",
      "target": "node24.11.0-win32-x64",
      "output": "myapp.exe"
    }
  ],
  "bundler": {
    "external": ["fsevents", "some-optional-dep"]
  }
}
```json
{
  "bundler": {
    "external": ["fsevents", "some-optional-dep"]
  }
}
```

Useful for:
- Platform-specific optional dependencies
- Packages that don't bundle well
- Reducing bundle size

## Platform Support

### Supported Targets

| Platform | Architectures | Example |
|----------|--------------|---------|
| Windows | x64, arm64 | `node24.11.0-win32-x64` |
| Linux | x64, arm64 | `node24.11.0-linux-x64` |
| macOS | x64, arm64 | `node24.11.0-darwin-arm64` |

### Node.js Versions

Works with Node.js 18.0.0 and above that support SEA.

## Troubleshooting

### Native modules not loading

If you see errors about missing `.node` files:
1. Check that the module was detected during build (look for "Native modules detected" in output)
2. Run with `--verbose` to see detailed bundling info
3. Ensure the module uses standard patterns (`bindings`, `node-gyp-build`, etc.)

### Build fails with signature removal error

Install the required tools:
- **Windows**: Install Windows SDK for `signtool.exe`
- **macOS**: Install Xcode Command Line Tools for `codesign`

### Cross-compilation issues

When building for a different platform than your current OS:
- Native module detection works cross-platform
- The bundled JavaScript is platform-agnostic
- Each target is built independently with the correct Node.js binary

## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/MeirionHughes/seabox).

## License

MIT

Copyright © 2025 Meirion Hughes
