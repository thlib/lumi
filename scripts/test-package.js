// @ts-check

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = dirname(dirname(fileURLToPath(import.meta.url)))
const temporary = mkdtempSync(join(tmpdir(), 'lumi-package-'))
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

try {
  const packDirectory = join(temporary, 'pack')
  const pnpmStore = join(temporary, 'pnpm-store')
  mkdirSync(packDirectory)

  const packOutput = execFileSync(
    pnpm,
    ['pack', '--json', '--pack-destination', packDirectory],
    {
      cwd: repository,
      encoding: 'utf8',
    },
  )

  const jsonStart = packOutput.indexOf('{\n  "name":')
  assert.notEqual(jsonStart, -1, 'pnpm pack did not return JSON output')
  /** @type {{
   *   filename: string,
   *   files: Array<{path: string}>
   * }} */
  const packed = JSON.parse(packOutput.slice(jsonStart))
  assert.ok(packed, 'pnpm pack did not describe a package')

  const packedPaths = packed.files.map(file => file.path)

  const declarationFiles = packedPaths
    .filter(path => path.startsWith('dist/') && path.endsWith('.d.ts'))
    .sort()

  assert.deepEqual(declarationFiles, [
    'dist/bindings.d.ts',
    'dist/cardinality.d.ts',
    'dist/component.d.ts',
    'dist/dom.d.ts',
    'dist/events.d.ts',
    'dist/index.d.ts',
    'dist/internal/diagnostics.d.ts',
    'dist/internal/no-value.d.ts',
    'dist/internal/projection-context.d.ts',
    'dist/internal/projection-error.d.ts',
    'dist/plan.d.ts',
    'dist/types.d.ts',
  ])

  // The browser bundle ships alongside the declarations so a CDN can serve one
  // file, and its sourcemap resolves against the published src/ tree.
  assert.ok(
    packedPaths.includes('dist/lumi.js'),
    'the browser bundle is missing from the package',
  )
  assert.ok(
    packedPaths.includes('dist/lumi.js.map'),
    'the browser bundle sourcemap is missing from the package',
  )

  writeFileSync(join(temporary, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
  }))
  execFileSync(
    pnpm,
    [
      'install',
      '--ignore-scripts',
      '--store-dir',
      pnpmStore,
      packed.filename,
    ],
    {
      cwd: temporary,
      stdio: 'ignore',
    },
  )

  writeFileSync(join(temporary, 'runtime.mjs'), `
    import assert from 'node:assert/strict'
    import * as lumi from '@thlib/lumi'

    assert.deepEqual(Object.keys(lumi).sort(), [
      'attr',
      'child',
      'classToggle',
      'component',
      'on',
      'prop',
      'repeat',
      'style',
      'text',
    ])

    const bundle = await import('@thlib/lumi/dist/lumi.js')
    assert.deepEqual(
      Object.keys(bundle).sort(),
      Object.keys(lumi).sort(),
      'the browser bundle does not expose the package export surface',
    )

    await assert.rejects(
      import('@thlib/lumi/types'),
      error => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    )
  `)
  execFileSync(process.execPath, ['runtime.mjs'], {
    cwd: temporary,
    stdio: 'inherit',
  })

  copyFileSync(
    join(repository, 'type-test', 'package-consumer.ts'),
    join(temporary, 'package-consumer.ts'),
  )
  const typescript = join(
    repository,
    'node_modules',
    'typescript',
    'bin',
    'tsc',
  )
  execFileSync(
    process.execPath,
    [
      typescript,
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      '--lib',
      'ES2022,DOM',
      'package-consumer.ts',
    ],
    {
      cwd: temporary,
      stdio: 'inherit',
    },
  )

  /** @type {{
   *   license?: string,
   *   repository?: {url?: string},
   *   publishConfig?: {access?: string}
   * }} */
  const manifest = JSON.parse(readFileSync(
    join(temporary, 'node_modules', '@thlib', 'lumi', 'package.json'),
    'utf8',
  ))
  assert.equal(manifest.license, 'Apache-2.0')
  assert.equal(
    manifest.repository?.url,
    'git+https://github.com/thlib/lumi.git',
  )
  assert.equal(manifest.publishConfig?.access, 'public')
} finally {
  rmSync(temporary, {
    force: true,
    recursive: true,
  })
}
