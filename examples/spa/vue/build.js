// @ts-check

import {spawnSync} from 'node:child_process'

run('vue-tsc', ['-b'])
run('vite', ['build'])

/** @param {string} command @param {string[]} args */
function run(command, args) {
  const result = spawnSync('pnpm', ['exec', command, ...args], {
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    process.exit()
  }
}
