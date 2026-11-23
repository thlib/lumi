// @ts-check

import {cpSync, mkdirSync, readFileSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const source = dirname(fileURLToPath(import.meta.url))
const root = dirname(source)
const output = join(root, 'dist')

rmSync(output, {recursive: true, force: true})
mkdirSync(output, {recursive: true})

const devImport = /^import \{DEV\} from '[^']*\/dev\.js'\n/m

/**
 * Removes the import of the development switch from each source module.
 * `DEV` is then a free name, and the `define` option gives it the value
 * `false` before the bundler examines the module. The bundler removes the
 * development checks, the warnings, and the message texts.
 *
 * @type {import('esbuild').Plugin}
 */
const production = {
  name: 'lumi-production',
  setup(build) {
    build.onLoad({filter: /\.js$/}, ({path}) => ({
      // The line break stays, so that the source map has the correct lines.
      contents: readFileSync(path, 'utf8').replace(devImport, '\n'),
      loader: 'js',
    }))
  },
}

// dist/lumi.js is the production version. dist/lumi.dev.js is the
// development version, with all checks, warnings, and message texts.
for (const [name, isProduction] of /** @type {const} */ ([
  ['lumi.js', true],
  ['lumi.dev.js', false],
])) {
  await build({
    entryPoints: [join(source, 'index.js')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    sourcemap: true,
    legalComments: 'none',
    banner: {
      js: '/*! @thlibjs/lumi | Apache-2.0 | https://github.com/thlib/lumi */',
    },
    outfile: join(output, name),
    plugins: isProduction ? [production] : [],
    define: isProduction ? {DEV: 'false'} : {},
    logLevel: 'info',
  })
}

cpSync(join(source, 'lumi.d.ts'), join(output, 'lumi.d.ts'))
