// @ts-nocheck

import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {basename, dirname, extname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {build, context} from 'esbuild'

const project = dirname(fileURLToPath(import.meta.url))
const source = join(project, 'src')
const spa = dirname(project)
const root = dirname(dirname(spa))
const output = join(project, 'dist')
const documents = ['components', 'pages'].map(name => join(source, name)).filter(existsSync)
const serve = process.argv.includes('--serve')

if (process.argv.some(argument => argument !== process.argv[0] && argument !== process.argv[1] && argument !== '--serve')) throw new Error('Use --serve or no build argument')
rmSync(output, {recursive: true, force: true})
mkdirSync(output, {recursive: true})

const options = {entryPoints: ['lumi-spa-entry'], bundle: true, format: 'esm', target: 'es2022', minify: !serve, sourcemap: true, outfile: join(output, 'app.js'), logLevel: 'info', plugins: [documentsPlugin()]}
if (serve) {
  const buildContext = await context(options)
  const server = await buildContext.serve({servedir: output, host: '127.0.0.1', port: Number.parseInt(process.env.LUMI_SPA_PORT ?? '8008', 10)})
  console.log(`Lumi TypeScript SPA available at http://${server.hosts[0] ?? '127.0.0.1'}:${server.port}/`)
} else {
  await build(options)
  console.log(`Lumi TypeScript SPA built into ${output}`)
}

function documentsPlugin() {
  return {name: 'lumi-ts-documents', setup(build) {
    build.onStart(() => {
      const errors = typeErrors()
      return errors.length === 0 ? undefined : {errors}
    })
    build.onResolve({filter: /^lumi-spa-entry$/}, () => ({path: 'entry', namespace: 'lumi-spa'}))
    build.onLoad({filter: /^entry$/, namespace: 'lumi-spa'}, () => ({contents: entryModule(), loader: 'ts', resolveDir: source, watchDirs: documents, watchFiles: [join(source, 'shell.html'), join(spa, 'spa.css'), join(project, 'tsconfig.json'), ...files()]}))
    build.onResolve({filter: /^lumi-document:/}, args => ({path: join(source, args.path.slice('lumi-document:'.length)), namespace: 'lumi-document'}))
    build.onLoad({filter: /\.html$/, namespace: 'lumi-document'}, args => ({contents: behavior(args.path), loader: 'ts', resolveDir: dirname(args.path), watchFiles: [args.path, args.path.replace(/\.html$/, '.ts')]}))
    build.onEnd(result => { if (result.errors.length === 0) emitPage() })
  }}
}

function typeErrors() {
  const result = spawnSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--project', join(project, 'tsconfig.json')], {cwd: root, encoding: 'utf8'})
  if (result.status === 0) return []
  return [{text: `${result.stdout}${result.stderr}`.replaceAll(`${root}/`, '').trim() || `TypeScript exited with status ${String(result.status)}`}]
}

function entryModule() {
  const declarations = files().map((file, index) => {
    return `  [${JSON.stringify(camelCase(basename(file, '.html')))}, component${index}],`
  })
  const imports = files().map((file, index) => {
    return `import component${index} from ${JSON.stringify(`lumi-document:${relative(source, file)}`)}`
  })
  imports.push("import {installDefinitions} from './components.ts'")
  imports.push("import './app.ts'")
  imports.push(`installDefinitions([\n${declarations.join('\n')}\n])`)
  return imports.join('\n')
}

function files() {
  const found = documents.flatMap(directory => readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isFile() && extname(entry.name) === '.html').map(entry => join(directory, entry.name)))
  return found.sort()
}

function behavior(file) {
  const markup = readFileSync(file, 'utf8').trim()
  if (!markup.startsWith('<template') || /<script(?:\s|>)/i.test(markup)) throw new Error(`${file} must contain a script-free native template`)
  return readFileSync(file.replace(/\.html$/, '.ts'), 'utf8')
}

function emitPage() {
  const shell = readFileSync(join(source, 'shell.html'), 'utf8')
  const closingBody = '\n  </body>'
  const markup = files().map(file => indent(readFileSync(file, 'utf8').trim(), 4)).join('\n\n')
  const page = shell.replace(closingBody, `\n\n${markup}${closingBody}`).replace('href="../../spa.css"', 'href="./spa.css"')
  if (page === shell) throw new Error('shell.html does not reference the shared stylesheet')
  writeFileSync(join(output, 'index.html'), page)
  cpSync(join(spa, 'spa.css'), join(output, 'spa.css'))
}

function indent(value, spaces) { const prefix = ' '.repeat(spaces); return value.split('\n').map(line => `${prefix}${line}`).join('\n') }

function camelCase(value) { return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase()) }
