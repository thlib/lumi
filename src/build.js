// @ts-check

import {cpSync, mkdirSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const source = dirname(fileURLToPath(import.meta.url))
const root = dirname(source)
const output = join(root, 'dist')

rmSync(output, {recursive: true, force: true})
mkdirSync(output, {recursive: true})

await build({
  entryPoints: [join(source, 'index.js')],
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

cpSync(join(source, 'lumi.d.ts'), join(output, 'lumi.d.ts'))
