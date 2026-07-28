// @ts-check

const {spawnSync} = require('node:child_process')

const result = spawnSync('pnpm', ['exec', 'ng', 'build'], {
  stdio: 'inherit',
})

if (result.status !== 0) {
  process.exitCode = result.status ?? 1
}
