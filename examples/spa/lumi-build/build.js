// @ts-nocheck

import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {basename, dirname, extname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build, context} from 'esbuild'

const source = dirname(fileURLToPath(import.meta.url))
const spa = dirname(source)
const output = join(source, 'dist')
const documents = ['components', 'pages']
  .map(name => join(source, name))
  .filter(existsSync)
const serve = process.argv.includes('--serve')

if (process.argv.some(argument => argument !== process.argv[0] && argument !== process.argv[1] && argument !== '--serve')) {
  throw new Error('Use --serve or no build argument')
}

rmSync(output, {recursive: true, force: true})
mkdirSync(output, {recursive: true})

const options = {
  entryPoints: ['lumi-spa-entry'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !serve,
  sourcemap: true,
  outfile: join(output, 'app.js'),
  logLevel: 'info',
  plugins: [documentsPlugin()],
}

if (serve) {
  const buildContext = await context(options)
  const server = await buildContext.serve({
    servedir: output,
    host: '127.0.0.1',
    port: Number.parseInt(process.env.LUMI_SPA_PORT ?? '8008', 10),
  })
  const host = server.hosts[0] ?? '127.0.0.1'
  console.log(`Lumi build SPA available at http://${host}:${server.port}/`)
} else {
  await build(options)
  console.log(`Lumi build SPA built into ${output}`)
}

function documentsPlugin() {
  return {
    name: 'lumi-build-documents',
    setup(build) {
      build.onResolve({filter: /^lumi-spa-entry$/}, () => ({
        path: 'entry',
        namespace: 'lumi-spa',
      }))
      build.onLoad({filter: /^entry$/, namespace: 'lumi-spa'}, () => ({
        contents: entryModule(),
        loader: 'js',
        resolveDir: source,
        watchDirs: documents,
        watchFiles: [join(source, 'shell.html'), join(spa, 'spa.css'), ...files()],
      }))
      build.onResolve({filter: /^lumi-document:/}, args => ({
        path: join(source, args.path.slice('lumi-document:'.length)),
        namespace: 'lumi-document',
      }))
      build.onLoad({filter: /\.html$/, namespace: 'lumi-document'}, args => ({
        contents: readDocument(args.path).module,
        loader: 'js',
        resolveDir: dirname(args.path),
        watchFiles: [args.path],
      }))
      build.onEnd(result => {
        if (result.errors.length === 0) emitPage()
      })
    },
  }
}

function entryModule() {
  const declarations = files().map((file, index) => {
    const name = relative(source, file)
    return `  [${JSON.stringify(camelCase(basename(file, '.html')))}, component${index}],`
  })
  const imports = files().map((file, index) => {
    return `import component${index} from ${JSON.stringify(`lumi-document:${relative(source, file)}`)}`
  })
  imports.push("import {installDefinitions} from './components.js'")
  imports.push("import './app.js'")
  imports.push(`installDefinitions([\n${declarations.join('\n')}\n])`)
  return imports.join('\n')
}

function files() {
  const found = documents.flatMap(directory => readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile() && extname(entry.name) === '.html')
    .map(entry => join(directory, entry.name)))
  const names = new Set()
  for (const file of found) {
    const name = basename(file, '.html')
    if (names.has(name)) throw new Error(`Duplicate component or page document name: ${name}`)
    names.add(name)
  }
  return found.sort()
}

function readDocument(file) {
  const document = readFileSync(file, 'utf8')
  const match = document.match(/\n<script type="module">\n([\s\S]*?)\n<\/script>\s*$/)
  if (match === null || match.index === undefined || match[1] === undefined) {
    throw new Error(`${file} must end with one <script type="module"> behavior block`)
  }
  const markup = document.slice(0, match.index).trim()
  if (!markup.startsWith('<template')) throw new Error(`${file} must start with a native <template>`)
  return {markup, module: match[1]}
}

function emitPage() {
  const shell = readFileSync(join(source, 'shell.html'), 'utf8')
  const closingBody = '\n  </body>'
  if (!shell.includes(closingBody)) throw new Error('shell.html does not contain a closing body element')
  const markup = files().map(file => indent(readDocument(file).markup, 4)).join('\n\n')
  const page = shell.replace(closingBody, `\n\n${markup}${closingBody}`).replace('href="../spa.css"', 'href="./spa.css"')
  if (page === shell) throw new Error('shell.html does not reference the shared stylesheet')
  writeFileSync(join(output, 'index.html'), page)
  cpSync(join(spa, 'spa.css'), join(output, 'spa.css'))
}

function indent(value, spaces) {
  const prefix = ' '.repeat(spaces)
  return value.split('\n').map(line => `${prefix}${line}`).join('\n')
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
}
