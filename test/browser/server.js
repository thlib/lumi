// @ts-check

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
])

createServer(async (request, response) => {
  const pathname = new URL(
    request.url ?? '/',
    'http://127.0.0.1',
  ).pathname
  const file = resolve(root, `.${pathname}`)

  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end()
    return
  }

  try {
    const details = await stat(file)

    if (!details.isFile()) {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, {
      'content-type': types.get(extname(file)) ?? 'application/octet-stream',
    })
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404).end()
  }
}).listen(4173, '127.0.0.1')
