// @ts-check

/**
 * Builds the SPA example into examples/spa/dist/.
 *
 * The example runs from source without a build step: index.html loads
 * ./app.js as a native module and every template script imports from that one
 * entry. This build bundles the same entry into one minified file and copies
 * index.html unchanged, because both forms resolve ./app.js and ./spa.css
 * beside index.html. The benchmark serves this directory so Lumi is measured
 * the way the framework applications it compares against are measured.
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const repository = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(repository, 'examples/spa')
const output = join(source, 'dist')

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

await build({
  entryPoints: [join(source, 'app.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  outfile: join(output, 'app.js'),
  logLevel: 'info',
})

for (const file of ['index.html', 'spa.css']) {
  cpSync(join(source, file), join(output, file))
}

console.log(`SPA example built into ${output}`)
