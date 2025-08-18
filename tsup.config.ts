import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['cjs'],
  dts: true, // 自动生成 .d.ts
  clean: true,
  splitting: false,
  minify: 'terser', // 使用terser进行更高级的压缩
  minifyIdentifiers: true,
  minifySyntax: true,
  minifyWhitespace: true,
  treeshake: true,
  banner: { js: '#!/usr/bin/env node\r\n' },
})
