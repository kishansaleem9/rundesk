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
import { retryAfterMs } from './signin.mjs'

const TYPES = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
}

const isApi = (url) => url.startsWith('/api') || url.startsWith('/socket.io') || url.startsWith('/realtime')

/**
 * Signing in through the FORM, when the login route is entitled to throttle.
 *
 * `/auth/login` allows 10 requests a minute per IP, and in CI every suite is
 * the same IP. A browser suite spends two of that budget on itself — one POST
 * for its API token, one more when it drives the form — so a run of quick
 * suites empties the window and whichever suite is running when it does starves
 * on a 429 it did nothing to earn.
 *
 * The API-side half of that is handled in `signin.mjs`, which every suite now
 * shares. This is the other half, and it lives here because every suite's
 * browser reaches the API through this one proxy: doing it here covers all
 * twenty-odd form sign-ins without twenty-odd call sites having to remember,
 * and covers the next suite too.
 *
 * It matters that the page never sees the 429. A throttled sign-in leaves the
 * form on screen looking exactly like a wrong password, so the suite's
 * `waitForURL` burns its whole timeout and then reports something untrue about
 * the app — the failure names the wrong thing, which is worse than the delay.
 *
 * Only 429 is retried, and only for the login POST: every other response,
 * including a real 401, is handed back untouched and immediately.
 */
/*
 * THREE ATTEMPTS, not four, and the reason is the caller's patience.
 *
 * The window is fixed, so each retry waits up to 61 seconds for it to roll.
 * Four attempts is a budget of ~183 seconds — longer than any caller will wait,
 * so the extra attempt could only ever produce a login that arrives after the
 * suite has already given up. Three bounds it at ~122s, and `LOGIN_NAV_TIMEOUT_MS`
 * is set to cover one boundary comfortably; needing two means the harness is
 * asking for more sign-ins than it should, which is worth failing over.
 */
const LOGIN_ATTEMPTS = 3
const isLogin = (req) => req.method === 'POST' && req.url.includes('/auth/login')

/** Collect a request body so it can be sent more than once. Login bodies are tiny. */
const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

/** One upstream round trip, resolved with the response. */
const forward = ({ apiPort, path: reqPath, method, headers, body }) =>
  new Promise((resolve, reject) => {
    const upstream = http.request({ host: '127.0.0.1', port: apiPort, path: reqPath, method, headers }, resolve)
    upstream.on('error', reject)
    upstream.end(body)
  })

async function proxyLogin(req, res, apiPort) {
  try {
    const body = await readBody(req)
    // Re-sent verbatim, so the length is restated rather than inherited: a
    // chunked original would otherwise contradict the buffer we now hold.
    const headers = { ...req.headers, 'content-length': String(body.length) }
    delete headers['transfer-encoding']

    for (let attempt = 1; ; attempt++) {
      const up = await forward({ apiPort, path: req.url, method: req.method, headers, body })
      if (up.statusCode !== 429 || attempt >= LOGIN_ATTEMPTS) {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
        return
      }
      up.resume() // Drain the 429 so the socket is free for the retry.
      const waitMs = retryAfterMs(up.headers['retry-after'], null)
      /*
       * SAID OUT LOUD. A sign-in that takes 45 seconds and then works is
       * indistinguishable from a hung page unless something says why. This line
       * is what run 529 needed and did not have: it would have named the cause
       * in the log instead of leaving a 30-second timeout to be guessed at.
       */
      console.log(
        `  \x1b[33m…\x1b[0m login throttled (attempt ${attempt}/${LOGIN_ATTEMPTS}); ` +
          `waiting ${Math.round(waitMs / 1000)}s for the rate-limit window to roll`,
      )
      await new Promise((r) => setTimeout(r, waitMs))
    }
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: `api proxy: ${err.message}` }))
  }
}

/**
 * @param {object} opts
 * @param {string} opts.dist   built SPA directory
 * @param {number} opts.apiPort port the Nest process is listening on
 * @param {number} [opts.port]  port to bind; 0 (the default) takes a free one.
 *   The older suites in here hardcode `http://127.0.0.1:5173`, which is the
 *   Vite dev server's port. Serving the BUILT bundle there lets them run
 *   against a real API without each of them learning a new address.
 */
/*
 * A BUNDLE OLDER THAN THE SOURCE IS NOT THE PRODUCT UNDER TEST.
 *
 * `apps/web/dist` is not in git, so nothing rebuilds it when a suite is run by
 * hand — and a suite driving a stale bundle reports failures about code that no
 * longer exists. I read three of them as a regression from my own edits:
 * `ai-answer-rendering` came back 48 of 51 against a dist twelve hours older
 * than `apps/web/src`, and the three failures were all in the AI panel, whose
 * fix had landed in that window.
 *
 * It is the same mistake the break logs had all morning, one layer down: a
 * measurement of a tree that is not this one. `wt-break.sh` builds before every
 * set so it never sees this; a suite run straight from the checkout does.
 *
 * mtime, deliberately, because this is a question about a BUILD rather than
 * about history: the dist is a product of the files as they are on disk, and a
 * source file the build has not seen is newer than everything in it. (A fresh
 * clone has no dist at all, so there is nothing to be wrong about.) Refused
 * rather than warned, because a warning above fifty PASS lines is a warning
 * nobody reads.
 */
function refuseStaleBundle(dist) {
  const newest = (dir) => {
    let latest = 0
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = path.join(dir, e.name)
      latest = Math.max(latest, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs)
    }
    return latest
  }
  const src = path.resolve(dist, '../src')
  if (!fs.existsSync(dist) || !fs.existsSync(src)) return
  const built = newest(dist)
  const written = newest(src)
  if (written <= built) return
  const ago = Math.round((written - built) / 60_000)
  throw new Error(
    `apps/web/dist is ${ago} minute(s) older than apps/web/src — this bundle is not the product ` +
      'under test. Run `pnpm --filter @rundesk/web build` first; every failure until then is about ' +
      'code that has already changed.',
  )
}

export async function startLocalStack({ dist, apiPort, port: bindPort = 0 }) {
  refuseStaleBundle(dist)
  const server = http.createServer((req, res) => {
    if (isApi(req.url)) {
      if (isLogin(req)) {
        void proxyLogin(req, res, apiPort)
        return
      }
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

  await new Promise((r) => server.listen(bindPort, '127.0.0.1', r))
  const port = server.address().port
  return { server, base: `http://127.0.0.1:${port}`, close: () => server.close() }
}
