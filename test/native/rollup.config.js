import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.js',
  output: {
    file: 'out/index.js',
    format: 'cjs',
    exports: 'auto'
  },
  plugins: [
    resolve({
      preferBuiltins: true
    }),
    commonjs({
      ignoreDynamicRequires: true
    }),
    json()
  ],
  external: [
    'path',
    'fs',
    'module',
    'crypto',
    'os',
    'bindings' // Don't bundle bindings - we'll provide a shim
  ]
};
