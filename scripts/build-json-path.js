// @ts-check

import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const repository = dirname(dirname(fileURLToPath(import.meta.url)))

await build({
  entryPoints: [join(repository, 'scripts/json-path-browser-entry.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  banner: {
    js: '// @ts-nocheck\n/*! @jsonjoy.com/json-path | Apache-2.0 | https://github.com/streamich/json-joy */',
  },
  outfile: join(repository, 'examples/vendor/json-path.js'),
  logLevel: 'info',
})
