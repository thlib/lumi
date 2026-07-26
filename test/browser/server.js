// @ts-check

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const port = Number.parseInt(process.env.LUMI_BROWSER_PORT ?? '4173', 10)
const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
])

createServer(async (request, response) => {
  const url = new URL(
    request.url ?? '/',
    'http://127.0.0.1',
  )
  const pathname = url.pathname
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

    const headers = {
      'content-type': types.get(extname(file)) ?? 'application/octet-stream',
    }

    if (url.searchParams.has('trusted-types')) {
      Reflect.set(
        headers,
        'content-security-policy',
        "require-trusted-types-for 'script'; trusted-types lumi-browser-test",
      )
    }

    response.writeHead(200, headers)
    createReadStream(file).pipe(response)
  } catch {
    response.writeHead(404).end()
  }
}).listen(port, '127.0.0.1')
