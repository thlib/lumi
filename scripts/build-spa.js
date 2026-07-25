// @ts-check

import {copyFile, mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {build} from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(root, 'examples/spa')
const outputRoot = resolve(sourceRoot, 'dist')

async function main() {
  const sourceIndex = await readFile(resolve(sourceRoot, 'index.html'), 'utf8')
  /** @type {string[]} */
  const inlineModules = []
  let bundleTagInserted = false
  const outputIndex = sourceIndex.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (tag, attributes, contents) => {
      if (!isModuleScript(attributes)) {
        return tag
      }

      if (!bundleTagInserted) {
        bundleTagInserted = true
        if (contents.trim() !== '') {
          inlineModules.push(contents)
        }
        return '<script type="module" src="./spa.js"></script>'
      }

      if (contents.trim() !== '') {
        inlineModules.push(contents)
      }
      return ''
    },
  )

  if (!bundleTagInserted || inlineModules.length === 0) {
    throw new Error('Could not find the Lumi SPA module scripts')
  }

  await rm(outputRoot, {force: true, recursive: true})
  await mkdir(outputRoot, {recursive: true})
  await Promise.all([
    writeFile(resolve(outputRoot, 'index.html'), outputIndex),
    copyFile(resolve(sourceRoot, 'spa.css'), resolve(outputRoot, 'spa.css')),
  ])

  const virtualModules = /** @type {[string, string][]} */ (
    inlineModules.map((contents, index) => {
      return [`lumi-inline-${index}`, contents]
    })
  )
  const entry = [
    ...virtualModules.map(([module]) => `import '${module}'`),
    "import './spa.js'",
  ].join('\n')

  await build({
    bundle: true,
    format: 'esm',
    minify: true,
    outfile: resolve(outputRoot, 'spa.js'),
    plugins: [{
      name: 'lumi-inline-modules',
      setup(pluginBuild) {
        pluginBuild.onResolve(
          {filter: /^lumi-inline-/},
          args => ({namespace: 'lumi-inline', path: args.path}),
        )
        pluginBuild.onLoad(
          {filter: /^lumi-inline-/, namespace: 'lumi-inline'},
          args => {
            const module = virtualModules.find(
              ([name]) => name === args.path,
            )
            if (module === undefined) {
              throw new Error(`Unknown virtual module "${args.path}"`)
            }
            return {contents: module[1], loader: 'js', resolveDir: sourceRoot}
          },
        )
      },
    }],
    stdin: {
      contents: entry,
      resolveDir: sourceRoot,
      sourcefile: 'lumi-entry.js',
    },
    target: 'es2022',
  })

  const bundleDetails = await readFile(resolve(outputRoot, 'spa.js'))
  console.log(
    `Built minified Lumi SPA bundle (${bundleDetails.byteLength} bytes) `
      + `in ${outputRoot}`,
  )
}

/** @param {string} attributes */
function isModuleScript(attributes) {
  return /\btype\s*=\s*["']module["']/i.test(attributes)
}

await main()
