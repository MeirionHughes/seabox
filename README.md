# seabox

A reusable tool for building Node.js Single Executable Applications (SEA) with native-module support.

## Features

- Bundle Node.js applications into standalone executables
- Automatic native module (.node, .dll, .so, .dylib) extraction and loading
- Asset encryption with obfuscated keys embedded in V8 snapshots
- Multi-platform targeting (Windows, Linux, macOS)
- V8 snapshot support for faster startup
- Integrity checking for extracted binaries
- Automatic code signature removal before injection
- Simple configuration via package.json

## Use case
This tooling was created as an alternative to pkg, which is unfortunatly deprecated, and where forks were running foul of virus checkers. By using node's SEA, the executables are directly from nodejs's distribution source, and built using node's native Single Executable Application solution. Unfortunatly this does mean native modules embedded within the exe cannot run directly and must be extracted to a location on the disk on first run - This tooling automates that process for you, while providing arbitrary asset embedding. Embedded assets are _not_ extracted and access to them is handled by intercepting require and fs.  

Note: **V8 snapshot includes and embedds the original source**, this is currently a limitation of Node's SEA tooling as far as I can tell; thus the snapshot is only useful for faster startup.  

## Installation

```bash
npm install --save-dev seabox
```

## Configuration

Add a `sea` configuration to your `package.json`:

```json
{
  "sea": {
    "entry": "./out/server.js",
    "assets": [
      "./out/client/**/*",
      "./out/lib/**/*",
      "./out/native/**/*",
      "!**/*.md",
      "!**/test/**"
    ],
    "binaries": [
      "*.node",
      "*.dll"
    ],
    "targets": [
      "node24.11.0-win32-x64"
    ],
    "output": "myapp.exe",
    "outputPath": "dist",
    "disableExperimentalSEAWarning": true,
    "useSnapshot": true,
    "useCodeCache": false
  }
}
```

## Configuration Options

- **entry**: Path to your bundled application entry point
- **assets**: Array of glob patterns for files to include (supports `!` prefix for exclusions, e.g., `"!**/*.md"`)
- **binaries**: Patterns to identify binary files that need extraction (e.g., `.node`, `.dll`)
- **targets**: Array of target platforms (format: `nodeX.Y.Z-platform-arch`)
- **output**: Name of the output executable
- **outputPath**: Directory for build output
- **disableExperimentalSEAWarning**: Suppress Node.js SEA experimental warnings (default: true)
- **useSnapshot**: Enable V8 snapshot for faster startup (default: false)
- **useCodeCache**: Enable V8 code cache (default: false)
- **encryptAssets**: Enable encryption for assets (default: false)
- **encryptExclude**: Patterns to exclude from encryption (e.g., `['*.txt']`)
- **rebuild**: Automatically rebuild native modules for the target platform before building the SEA (default: false)
- **rcedit**: (Windows only) Customize executable icon and version information. See [rcedit options](#windows-executable-customization-rcedit)
- **cacheLocation**: Custom cache directory for extracted binaries (default: `'./.sea-cache'`). Supports environment variable expansion (e.g., `'%LOCALAPPDATA%\\myapp-cache'` on Windows or `'$HOME/.cache/myapp'` on Unix)

## Usage

After installing `seabox` as a dev dependency and configuring your `package.json`, build your SEA executable:

### npm script (recommended)

Add a build script to your `package.json`:

```json
{
  "scripts": {
    "build:exe": "seabox",
    "build:exe:verbose": "seabox --verbose"
  }
}
```

Then run:

```bash
npm run build:exe
```

### CLI

```bash
# Build using package.json configuration
npx seabox

# Build using a standalone config file (alternative to package.json)
npx seabox --config sea-config.json

# Verbose output
npx seabox --verbose

```

### Programmatic API

```javascript
const { build } = require('seabox');

await build({
  projectRoot: process.cwd(),
  verbose: true
});
```

## How It Works

1. **Asset Scanning**: Scans and resolves all files matching your asset patterns
2. **Manifest Generation**: Creates a runtime manifest with metadata for binary extraction
3. **Bootstrap Injection**: Prepends bootstrap code to handle native module extraction
4. **Blob Creation**: Uses Node.js SEA tooling to create the application blob
5. **Binary Fetching**: Downloads the target Node.js binary and removes its signature
6. **Injection**: Uses postject to inject the blob into the Node binary
7. **Output**: Produces a standalone executable ready for signing and distribution

**Note on signature removal**: The signature removal step requires platform-specific tools to be available in your PATH:
- **Windows**: `signtool.exe`
- **macOS**: `codesign`
- **Linux**: Not required 

## Binary Extraction

Native modules (`.node`, `.dll`, `.so`, `.dylib`) are automatically:
- Extracted to a cache directory on first run
- Integrity-checked using SHA-256 hashes
- Loaded via custom module resolution

### Cache Location

By default, binaries are extracted to: `./.sea-cache/<appname>/<version>-<platform>-<arch>`

You can customize the cache location in your configuration:

```json
{
  "sea": {
    "cacheLocation": "%LOCALAPPDATA%\\myapp-cache"
  }
}
```

The cache location supports environment variable expansion:
- **Windows**: `%LOCALAPPDATA%`, `%APPDATA%`, `%TEMP%`, etc.
- **Unix/Linux/macOS**: `$HOME`, `$TMPDIR`, `${XDG_CACHE_HOME}`, etc.

**Override at runtime**: Set the `SEACACHE` environment variable to override the configured location:

```bash
# Windows
set SEACACHE=C:\custom\cache\path
myapp.exe

# Unix/Linux/macOS
export SEACACHE=/custom/cache/path
./myapp
```

## Native Module Rebuilding

If your project has native modules (e.g., `.node` bindings), you may need to rebuild them for the target Node.js version:

```bash
# Rebuild for a specific target
npx seabox-rebuild --target node24.11.0-win32-x64

# Rebuild with separate options
npx seabox-rebuild --node-version 24.11.0 --platform linux --arch x64

# Rebuild in a specific directory
npx seabox-rebuild /path/to/project --target node24.11.0-linux-x64
```

The rebuilder will:
- Scan all dependencies for native modules (those with `binding.gyp` or `gypfile: true`)
- Rebuild each one using `node-gyp` for the target platform and Node.js version
- Download necessary headers for cross-compilation

**Note**: Cross-compilation may require additional platform-specific build tools installed.

## Windows Executable Customization (rcedit)

For Windows executables, you can customize the icon and version information using the `rcedit` configuration option:

```json
{
  "sea": {
    "output": "myapp.exe",
    "targets": ["node24.11.0-win32-x64"],
    "rcedit": {
      "icon": ".\\assets\\myapp.ico",
      "file-version": "1.2.3.4",
      "product-version": "1.2.3.4",
      "version-string": {
        "CompanyName": "My Company",
        "FileDescription": "My Application",
        "ProductName": "MyApp",
        "InternalName": "myapp.exe",
        "OriginalFilename": "myapp.exe",
        "LegalCopyright": "Copyright (C) 2025 My Company"
      }
    }
  }
}
```

### rcedit Options

- **icon**: Path to `.ico` file for the executable icon
- **file-version**: File version in `X.X.X.X` format
- **product-version**: Product version in `X.X.X.X` format
- **version-string**: Object containing version string properties:
  - `CompanyName`: Company name
  - `FileDescription`: Description of the file
  - `ProductName`: Product name
  - `InternalName`: Internal name
  - `OriginalFilename`: Original filename
  - `LegalCopyright`: Copyright notice
  - `LegalTrademarks`: Trademark information (optional)
  - `PrivateBuild`: Private build description (optional)
  - `SpecialBuild`: Special build description (optional)

The rcedit step runs after signature removal and before the SEA blob injection. This only works for Windows (`win32`) targets.

For more details, see the [rcedit documentation](https://github.com/electron/rcedit).

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
