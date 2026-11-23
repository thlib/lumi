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
    'dist/lumi.d.ts',
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

  // dist/lumi.js is the production build. dist/lumi.dev.js is the
  // development build, with the checks, the warnings, and the message texts.
  assert.ok(
    packedPaths.includes('dist/lumi.dev.js'),
    'the development bundle is missing from the package',
  )
  assert.ok(
    packedPaths.includes('dist/lumi.dev.js.map'),
    'the development bundle sourcemap is missing from the package',
  )

  assert.ok(
    packedPaths.includes('src/shims/move-before.js'),
    'the moveBefore shim is missing from the package',
  )
  assert.ok(
    packedPaths.includes('src/check.js')
      && packedPaths.includes('src/check.d.ts'),
    'the selector check is missing from the package',
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
    import * as lumi from '@thlibjs/lumi'

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

    const bundle = await import('@thlibjs/lumi/dist/lumi.js')
    assert.deepEqual(
      Object.keys(bundle).sort(),
      Object.keys(lumi).sort(),
      'the browser bundle does not expose the package export surface',
    )

    const development = await import('@thlibjs/lumi/dist/lumi.dev.js')
    assert.deepEqual(
      Object.keys(development).sort(),
      Object.keys(lumi).sort(),
      'the development bundle does not expose the package export surface',
    )

    // The package entry is the development version. The "production"
    // condition selects the production build.
    const invalid = () => lumi.attr('button', 'onclick', () => '')
    assert.throws(invalid, /^Error: Lumi E1: attribute binding "onclick"/)
    assert.throws(
      () => bundle.attr('button', 'onclick', () => ''),
      /^Error: Lumi E1 attribute onclick$/,
    )

    const shim = await import('@thlibjs/lumi/shims/move-before.js')
    assert.equal(typeof shim.installMoveBefore, 'function')

    // The selector check is a separate module, outside the bundle.
    const check = await import('@thlibjs/lumi/check.js')
    assert.equal(typeof check.unmatchedSelectors, 'function')
    assert.equal('unmatchedSelectors' in lumi, false)

    await assert.rejects(
      import('@thlibjs/lumi/types'),
      error => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    )
  `)
  execFileSync(process.execPath, ['runtime.mjs'], {
    cwd: temporary,
    stdio: 'inherit',
  })

  writeFileSync(join(temporary, 'production.mjs'), `
    import assert from 'node:assert/strict'
    import {attr} from '@thlibjs/lumi'

    assert.throws(
      () => attr('button', 'onclick', () => ''),
      /^Error: Lumi E1 attribute onclick$/,
    )
  `)
  execFileSync(
    process.execPath,
    ['--conditions=production', 'production.mjs'],
    {
      cwd: temporary,
      stdio: 'inherit',
    },
  )

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
    join(temporary, 'node_modules', '@thlibjs', 'lumi', 'package.json'),
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
