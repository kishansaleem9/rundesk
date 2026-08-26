/**
 * The whole product on localhost: the built SPA, and the real API behind it.
 *
 * The browser suites in here drive `apps/web/dist` off a dumb static server
 * with every API call stubbed. That is the right shape for asking "does this
 * screen render what it was given" and the wrong shape for asking "does this
 * feature work", because the answer is decided by the stub.
 *
 * This serves the same built bundle but proxies `/api` to a real Nest process
 * against a real Postgres — including the WebSocket upgrade, because call
 * signalling rides Socket.io and a proxy that only forwards HTTP leaves every
 * call stuck at "connecting" for reasons that look like a bug in the app.
 *
 * Same-origin on purpose: the SPA asks `window.location.origin` for both, so
 * anything else changes the thing under test.
 */
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
}

const isApi = (url) => url.startsWith('/api') || url.startsWith('/socket.io') || url.startsWith('/realtime')

/**
 * @param {object} opts
 * @param {string} opts.dist   built SPA directory
 * @param {number} opts.apiPort port the Nest process is listening on
 */
export async function startLocalStack({ dist, apiPort }) {
  const server = http.createServer((req, res) => {
    if (isApi(req.url)) {
      const upstream = http.request(
        { host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers },
        (up) => {
          res.writeHead(up.statusCode ?? 502, up.headers)
          up.pipe(res)
        },
      )
      upstream.on('error', (err) => {
        // Said out loud rather than hanging: a dead API behind a live page is
        // the single most confusing state to debug from the browser side.
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: `api proxy: ${err.message}` }))
      })
      req.pipe(upstream)
      return
    }

    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(dist, rel)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html')
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      // The SPA shell must never be cached here, or a reload inside a test
      // gets the previous build and the failure looks like the app's fault.
      'cache-control': 'no-store',
    })
    fs.createReadStream(file).pipe(res)
  })

  // Socket.io with transports:['websocket'] never sends a pollable HTTP
  // request — it upgrades immediately. Without this the connection fails and
  // every realtime assertion below it fails for the wrong reason.
  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(apiPort, '127.0.0.1', () => {
      upstream.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n') +
          '\r\n\r\n',
      )
      if (head?.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })

  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}`, close: () => server.close() }
}
