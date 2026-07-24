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
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

try {
  const packDirectory = join(temporary, 'pack')
  const npmCache = join(temporary, 'npm-cache')
  mkdirSync(packDirectory)

  const packOutput = execFileSync(
    npm,
    [
      'pack',
      '--ignore-scripts=false',
      '--json',
      '--pack-destination',
      packDirectory,
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...process.env,
        npm_config_cache: npmCache,
        npm_config_loglevel: 'silent',
      },
    },
  )

  /** @type {Array<{
   *   filename: string,
   *   files: Array<{path: string}>
   * }>} */
  const packResult = JSON.parse(packOutput)
  const packed = packResult[0]
  assert.ok(packed, 'npm pack did not describe a package')

  const declarationFiles = packed.files
    .map(file => file.path)
    .filter(path => path.startsWith('dist/') && path.endsWith('.d.ts'))
    .sort()

  assert.deepEqual(declarationFiles, [
    'dist/bindings.d.ts',
    'dist/cardinality.d.ts',
    'dist/component.d.ts',
    'dist/dom.d.ts',
    'dist/index.d.ts',
    'dist/internal/no-value.d.ts',
    'dist/plan.d.ts',
    'dist/types.d.ts',
  ])

  writeFileSync(join(temporary, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
  }))
  execFileSync(
    npm,
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(packDirectory, packed.filename),
    ],
    {
      cwd: temporary,
      env: {
        ...process.env,
        npm_config_cache: npmCache,
        npm_config_loglevel: 'silent',
      },
      stdio: 'ignore',
    },
  )

  writeFileSync(join(temporary, 'runtime.mjs'), `
    import assert from 'node:assert/strict'
    import * as lumi from '@thlib/lumi'

    assert.deepEqual(Object.keys(lumi).sort(), [
      'attr',
      'bind',
      'child',
      'classToggle',
      'component',
      'event',
      'prop',
      'style',
    ])

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
