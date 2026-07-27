// @ts-check

import {copyFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const repository = dirname(dirname(fileURLToPath(import.meta.url)))
const output = join(repository, 'dist')

await build({
  entryPoints: [join(repository, 'src/index.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  banner: {
    js: '/*! @thlib/lumi | Apache-2.0 | https://github.com/thlib/lumi */',
  },
  outfile: join(output, 'lumi.js'),
  logLevel: 'info',
})

copyFileSync(join(output, 'index.d.ts'), join(output, 'lumi.d.ts'))
