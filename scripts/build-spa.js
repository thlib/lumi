// @ts-check

/**
 * Builds the bundled Lumi SPA from native HTML view documents.
 *
 * Reusable views live in components/ while route-wide views live in pages/.
 * The JavaScript variant keeps behavior modules inline with those documents;
 * the TypeScript variant keeps declarative markup in HTML and composes its
 * Lumi bindings from ordinary `.ts` modules. The build bundles the selected
 * behavior entry and assembles the native HTML into one document.
 *
 * `--serve` keeps the same bundle pipeline active for development and serves
 * the selected variant's dist/ directory directly.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build, context } from 'esbuild'

const repository = dirname(dirname(fileURLToPath(import.meta.url)))
const spa = join(repository, 'examples/spa')
const variant = process.argv
  .slice(2)
  .find(argument => !argument.startsWith('--'))

if (variant !== 'lumi-build' && variant !== 'lumi-ts') {
  throw new Error('Choose a bundled SPA variant: lumi-build or lumi-ts')
}

const source = join(spa, variant)
const typescript = variant === 'lumi-ts'
const componentsDirectory = join(source, 'components')
const pagesDirectory = join(source, 'pages')
const documentDirectories = [
  componentsDirectory,
  ...(existsSync(pagesDirectory) ? [pagesDirectory] : []),
]
const shellFile = join(source, 'shell.html')
const stylesheetFile = join(spa, 'spa.css')
const typeScriptConfig = join(source, 'tsconfig.json')
const output = join(source, 'dist')
const serve = process.argv.includes('--serve')
const unknownArguments = process.argv
  .slice(2)
  .filter(argument => argument !== '--serve' && argument !== variant)

if (unknownArguments.length > 0) {
  throw new Error(`Unknown SPA build argument: ${unknownArguments.join(' ')}`)
}

rmSync(output, {recursive: true, force: true})
mkdirSync(output, {recursive: true})

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['lumi-spa-entry'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: !serve,
  sourcemap: true,
  outfile: join(output, 'app.js'),
  logLevel: 'info',
  plugins: [viewDocumentsPlugin()],
}

if (serve) {
  const buildContext = await context(options)
  const server = await buildContext.serve({
    servedir: output,
    host: '127.0.0.1',
    port: Number.parseInt(process.env.LUMI_SPA_PORT ?? '8008', 10),
  })
  const host = server.hosts[0] ?? '127.0.0.1'

  console.log(
    `Bundled ${variant} SPA available at http://${host}:${server.port}/`,
  )
} else {
  await build(options)
  console.log(`${variant} SPA built into ${output}`)
}

/**
 * Loads native view documents and exposes the selected variant's behavior
 * modules to esbuild. JavaScript behavior is extracted from the HTML while
 * TypeScript behavior is imported from the source tree.
 *
 * @returns {import('esbuild').Plugin}
 */
function viewDocumentsPlugin() {
  return {
    name: 'lumi-view-documents',

    setup(build) {
      if (typescript) {
        build.onStart(() => {
          const errors = typeScriptErrors()
          return errors.length === 0 ? undefined : {errors}
        })
      }

      build.onResolve({filter: /^lumi-spa-entry$/}, () => ({
        path: 'entry',
        namespace: 'lumi-spa',
      }))

      build.onLoad(
        {filter: /^entry$/, namespace: 'lumi-spa'},
        () => {
          const documentFiles = readDocumentFiles()

          if (typescript) {
            return {
              contents: "import './app.ts'",
              loader: 'ts',
              resolveDir: source,
              watchDirs: documentDirectories,
              watchFiles: [
                shellFile,
                stylesheetFile,
                typeScriptConfig,
                ...documentFiles,
              ],
            }
          }

          const imports = documentFiles.map((file, index) => {
            const name = relative(source, file)
            const specifier = JSON.stringify(`lumi-document:${name}`)
            return `import component${index} from ${specifier}`
          })

          imports.push(
            "import {installDefinitions} from './components.js'",
          )
          imports.push("import './app.js'")

          const declarations = documentFiles.map((file, index) => {
            const filename = basename(file, '.html')
            return `  [${JSON.stringify(camelCase(filename))}, component${index}],`
          })
          imports.push(
            'installDefinitions([\n'
            + `${declarations.join('\n')}\n`
            + '])',
          )

          return {
            contents: imports.join('\n'),
            loader: 'js',
            resolveDir: source,
            watchDirs: documentDirectories,
            watchFiles: [
              shellFile,
              stylesheetFile,
              ...documentFiles,
            ],
          }
        },
      )

      build.onResolve({filter: /^lumi-document:/}, args => ({
        path: join(source, args.path.slice('lumi-document:'.length)),
        namespace: 'lumi-document',
      }))

      build.onLoad(
        {filter: /\.html$/, namespace: 'lumi-document'},
        args => ({
          contents: readDocument(args.path).module,
          loader: typescript ? 'ts' : 'js',
          resolveDir: dirname(args.path),
          watchFiles: [args.path],
        }),
      )

      build.onEnd(result => {
        if (result.errors.length === 0) {
          emitHtmlAndStyles()
        }
      })
    },
  }
}

/**
 * @returns {string[]}
 */
function readDocumentFiles() {
  const files = documentDirectories.flatMap(directory => {
    return readdirSync(directory, {withFileTypes: true})
      .filter(entry => entry.isFile() && extname(entry.name) === '.html')
      .map(entry => join(directory, entry.name))
  })
  const names = new Set()

  for (const file of files) {
    const name = basename(file, '.html')
    if (names.has(name)) {
      throw new Error(
        `Duplicate component or page document name: ${name}`,
      )
    }
    names.add(name)
  }

  return files
    .sort()
}

/**
 * The behavior module is deliberately the final top-level element. Keeping
 * that small source contract avoids inventing component syntax or parsing and
 * reserializing the component's native HTML.
 *
 * @param {string} file
 * @returns {{markup: string, module: string}}
 */
function readDocument(file) {
  const document = readFileSync(file, 'utf8')

  if (typescript) {
    const markup = document.trim()

    if (!markup.startsWith('<template')) {
      throw new Error(`${file} must start with a native <template>`)
    }

    if (/<script(?:\s|>)/i.test(markup)) {
      throw new Error(`${file} must keep behavior in TypeScript modules`)
    }

    return {
      markup,
      module: '',
    }
  }

  const match = document.match(
    /\n<script type="module">\n([\s\S]*?)\n<\/script>\s*$/,
  )

  if (match === null || match.index === undefined) {
    throw new Error(
      `${file} must end with one <script type="module"> behavior block`,
    )
  }

  const markup = document.slice(0, match.index).trim()
  const module = match[1]

  if (module === undefined) {
    throw new Error(`${file} has an empty component module match`)
  }

  if (!markup.startsWith('<template')) {
    throw new Error(`${file} must start with a native <template>`)
  }

  return {
    markup,
    module,
  }
}

/**
 * Type-checks the standalone TypeScript modules with the same project that
 * editors use.
 *
 * @returns {import('esbuild').PartialMessage[]}
 */
function typeScriptErrors() {
  const compiler = join(repository, 'node_modules/typescript/bin/tsc')
  const result = spawnSync(
    process.execPath,
    [compiler, '--project', typeScriptConfig],
    {cwd: repository, encoding: 'utf8'},
  )

  if (result.status === 0) {
    return []
  }

  const output = `${result.stdout}${result.stderr}`
    .replaceAll(`${repository}/`, '')
    .trim()

  return [{
    text: output === ''
      ? `TypeScript exited with status ${String(result.status)}`
      : output,
  }]
}

function emitHtmlAndStyles() {
  const shell = readFileSync(shellFile, 'utf8')
  const closingBody = '\n  </body>'

  if (!shell.includes(closingBody)) {
    throw new Error(`${shellFile} does not contain a closing body element`)
  }

  const documentMarkup = readDocumentFiles()
    .map(file => indent(readDocument(file).markup, 4))
    .join('\n\n')
  const assembled = shell.replace(
    closingBody,
    `\n\n${documentMarkup}${closingBody}`,
  )
  const productionHtml = assembled.replace(
    'href="../spa.css"',
    'href="./spa.css"',
  )

  if (productionHtml === assembled) {
    throw new Error(`${shellFile} does not reference the shared stylesheet`)
  }

  writeFileSync(join(output, 'index.html'), productionHtml)
  cpSync(stylesheetFile, join(output, 'spa.css'))
}

/**
 * @param {string} value
 * @param {number} spaces
 * @returns {string}
 */
function indent(value, spaces) {
  const prefix = ' '.repeat(spaces)
  return value
    .split('\n')
    .map(line => `${prefix}${line}`)
    .join('\n')
}

/**
 * @param {string} value
 * @returns {string}
 */
function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase())
}
