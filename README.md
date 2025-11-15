# seabox

A reusable tool for building Node.js Single Executable Applications (SEA) with native-module support and binary extraction. 

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

## Use case
This tooling was created as an alternative to pkg, which is unfortunatly deprecated, and where forks were running foul of virus checkers. By using node's SEA, the executables are directly downloaded from nodejs's distribution source, and built using node's native Single Executable Application solution. Unfortunatly this does mean native modules embedded within the exe cannot run directly and must be extracted to a location on the disk on first run - This tooling automates that process for you, while providing arbitrary asset embedding. Embedded assets are _not_ extracted and access to them is handled by intercepting require and fs.  

Note: **V8 snapshot includes and embedds the original source**, this is currently a limitation of Node's SEA tooling as far as I can tell; thus the snapshot is only useful for faster startup. Its possible to get around this by using bytenode's vm.script hack (embed the bytenode code as an asset and run another vm snapshot with the faux script input) and I'll look into supporting it in the future. 

## Installation

```bash
npm install --save-dev seabox
```

### Optional: Windows Executable Metadata

If you want to customize Windows executable metadata (icon, version info), install `rcedit`:

```bash
npm install --save-dev rcedit
```

This is only needed if you use the `rcedit` configuration option.

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
| `outputs[].libraries` | `array` | No | Explicit glob patterns for shared libraries (DLLs/SOs) requiring filesystem extraction. Libraries referenced in code via `, ...)` are automatically detected. |
| `outputs[].rcedit` | `object` | No | Windows executable metadata (icon, version info) |
| `assets` | `array` | No | Glob patterns for assets to embed (merged with auto-detected assets) |
| `bundler` | `object` | No | Rolldown Bundler options |
| `bundler.external` | `array` | No | Modules to exclude from bundling |
| `bundler.plugins` | `array` | No | Additional Rolldown plugins |
| `bundler.minify` | `boolean` | No | Minify bundled code |
| `bundler.sourcemap` | `boolean` | No | Generate source maps |
| `encryptAssets` | `boolean` | No | Enable asset encryption (default: false) |
| `encryptExclude` | `array` | No | Glob patterns to exclude from encryption |
| `useSnapshot` | `boolean` | No | Enable V8 startup snapshots (default: true) |
| `useCodeCache` | `boolean` | No | Enable V8 code cache (default: false) |
| `cacheLocation` | `string` | No | Path for code cache storage |
| `sign` | `string` | No | Path to custom signing script (.mjs/.cjs) |
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

1. **Bundling** - Automatically bundles your app with Rolldown, detecting:
   - Native module patterns (`bindings`, `node-gyp-build`, direct `.node` requires)
   - Asset references via `path.join(__dirname, 'relative/path')`
   - Additional 

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

### Platform-Specific Libraries

Libraries that require filesystem access (like DLLs loaded via `dlopen`) can be included in two ways:

**1. Automatic Detection (Recommended)**

If your code references a DLL using `path.join(__dirname, ...)`, it will be automatically detected and included:

```javascript
// This will be automatically detected during bundling
const dllPath = path.join(__dirname, './lib/RGDevice.dll');
```

**2. Explicit Glob Patterns**

You can also explicitly specify library patterns in your config:

```json
{
  "outputs": [
    {
      "target": "node24.11.0-win32-x64",
      "libraries": ["lib/*.dll"]  // Manually specify DLLs to include
    }
  ]
}
```


These files are extracted on first run (like `.node` files) since they need to be loaded from the filesystem.

### Code Signature Removal

Required before SEA injection. Platform-specific tools needed:
- **Windows**: `signtool.exe` (from Windows SDK)
- **macOS**: `codesign` (included with Xcode)
- **Linux**: Not required

### Custom Signing

You can apply code signing after the build completes by specifying a custom signing script:

```json
{
  "sign": "./scripts/sign.mjs"
}
```

The signing script must export a default function that receives a config object:

```javascript
// scripts/sign.mjs
export default async function sign(config) {
  const { exePath, target, platform, arch, nodeVersion, projectRoot } = config;
  
  // Example: Windows code signing with signtool
  if (platform === 'win32') {
    execSync(`signtool sign /fd SHA256 /a "${exePath}"`);
  }
  
  // Example: macOS code signing
  if (platform === 'darwin') {
    execSync(`codesign --force --sign "Developer ID" "${exePath}"`);
  }
}
```

**Config parameters:**
- `exePath` - Absolute path to the built executable
- `target` - Full target string (e.g., "node24.11.0-win32-x64")
- `platform` - Platform name (win32, linux, darwin)
- `arch` - Architecture (x64, arm64)
- `nodeVersion` - Node.js version
- `projectRoot` - Absolute path to project root

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
4. **Key Obfuscation**: the bootstrap and key code are obfuscated
5. **Runtime Decryption**: Assets are transparently decrypted when accessed

### Considerations

- **Binary files** (`.node`, `.dll`, `.so`, `.dylib`) are **never encrypted** as they must be extracted as-is
- The manifest (`sea-manifest.json`) is **not encrypted** to allow bootstrap initialization
- **V8 snapshot includes the original source**, this is currently a limitation of Node's SEA tooling. 
- Encryption provides **obfuscation**, not cryptographic security against determined attackers
- The bootloader code, that includes the encryption key, is obfuscated in the source embedded by Node's SEA
  
## Contributing

Contributions welcome! Please open an issue or PR on [GitHub](https://github.com/MeirionHughes/seabox).

## License

MIT

Copyright © 2025 Meirion Hughes
