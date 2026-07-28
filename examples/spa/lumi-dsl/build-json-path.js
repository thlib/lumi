// @ts-check

import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const project = dirname(fileURLToPath(import.meta.url))
const source = join(project, 'src')
const root = dirname(dirname(dirname(project)))

await build({
  entryPoints: [join(source, 'json-path-browser-entry.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  banner: {
    js: '// @ts-nocheck\n/*! @jsonjoy.com/json-path | Apache-2.0 | https://github.com/streamich/json-joy */',
  },
  outfile: join(root, 'examples/vendor/json-path.js'),
  logLevel: 'info',
})
