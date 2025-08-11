import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import del from 'rollup-plugin-delete'
import progress from 'rollup-plugin-progress'
import shebang from 'rollup-plugin-shebang'
import { terser } from 'rollup-plugin-terser'

export default {
  input: 'src/cli.ts',
  output: [
    { file: 'dist/index.mjs', format: 'es' },
    { file: 'dist/index.cjs', format: 'cjs' },
  ],
  plugins: [
    del({ targets: 'dist/*' }),
    progress({ // 添加进度插件
      clearLine: true,
      format: '[:bar] :percent (:current/:total)',
    }),
    resolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      outputToFilesystem: true,
      // 添加TS编译选项解决私有字段问题
      compilerOptions: {
        target: 'ES2022',
        useDefineForClassFields: false,
      },
    }),
    // 将 terser 移到最后，只用于 cjs 输出
    terser({
      compress: {
        drop_console: false,
      },
      // 解决私有字段问题
      ecma: 2022,
      module: true,
    }),
  ],
  external: ['tslib'],
}
