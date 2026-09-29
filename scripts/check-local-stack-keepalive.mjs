#!/usr/bin/env node
/**
 * THE E2E PROXY NEVER TELLS A CLIENT TO KEEP A SOCKET LONGER THAN IT KEEPS IT.
 *
 * `test/e2e/lib/local-stack.mjs` serves the web bundle and proxies `/api` to a
 * lane. It forwarded the API's `Keep-Alive: timeout=72` while its own server
 * closes an idle socket after 5 s, so a suite's `fetch` through it, after a
 * pause, went out on a closed socket and died with "fetch failed"
 * (found-28-sep/e2e-proxy-advertises-the-apis-keep-alive).
 *
 * Checked against a stand-in API that says `timeout=72`, as the real one does:
 *   1. the proxy's answer advertises no longer a keep-alive than the proxy keeps;
 *   2. requests after idle gaps longer than the proxy's keep-alive all succeed.
 *
 * `--mutate` also runs the check against a copy of the proxy that forwards the
 * upstream headers as they come, and requires the check to fail there.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const LIB = path.join(ROOT, 'test/e2e/lib/local-stack.mjs')
const GAP_MS = 6000
const REQUESTS = 3

async function check(libPath) {
  const { startLocalStack } = await import(pathToFileURL(libPath).href + `?v=${Date.now()}`)
  const api = http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json', connection: 'keep-alive', 'keep-alive': 'timeout=72' })
      res.end('{"data":{"ok":true}}')
    })
  })
  api.keepAliveTimeout = 72_000
  await new Promise((r) => api.listen(0, '127.0.0.1', r))
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'ka-dist-'))
  fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>')
  const stack = await startLocalStack({ dist, apiPort: api.address().port })
  const ownMs = stack.server.keepAliveTimeout
  const problems = []
  try {
    for (let i = 0; i < REQUESTS; i += 1) {
      try {
        const r = await fetch(`${stack.base}/api/v1/ping`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
        await r.text()
        const advertised = Number(/timeout=(\d+)/.exec(r.headers.get('keep-alive') ?? '')?.[1] ?? 0) * 1000
        if (advertised > ownMs) problems.push(`request ${i}: advertised a ${advertised / 1000} s keep-alive, and this proxy keeps ${ownMs / 1000} s`)
      } catch (e) {
        problems.push(`request ${i}: ${e?.cause?.code ?? e?.message} after a ${GAP_MS / 1000} s idle gap`)
      }
      if (i < REQUESTS - 1) await new Promise((r) => setTimeout(r, GAP_MS))
    }
  } finally {
    stack.close()
    api.close()
    fs.rmSync(dist, { recursive: true, force: true })
  }
  return problems
}

const mutate = process.argv.includes('--mutate')
const real = await check(LIB)
if (real.length > 0) {
  console.error(`[local-stack-keepalive] not ok:\n  ${real.join('\n  ')}`)
  process.exit(1)
}
console.log(`[local-stack-keepalive] ok — ${REQUESTS} requests, ${GAP_MS / 1000} s apart, each advertised no longer a keep-alive than the proxy keeps`)
if (mutate) {
  const copy = path.join(path.dirname(LIB), `.local-stack-mutant-${process.pid}.mjs`)
  const src = fs.readFileSync(LIB, 'utf8')
  const mutant = src.replace(/endToEndHeaders\(up\.headers\)/g, 'up.headers')
  if (mutant === src) {
    console.error('[local-stack-keepalive] the mutation found nothing to change — the check cannot say it bites')
    process.exit(1)
  }
  fs.writeFileSync(copy, mutant)
  try {
    const caught = await check(copy)
    if (caught.length === 0) {
      console.error('[local-stack-keepalive] the mutant that forwards the upstream keep-alive PASSED — this check does not bite')
      process.exit(1)
    }
    console.log(`[local-stack-keepalive] mutation bites: forwarding the upstream headers is caught (${caught[0]})`)
  } finally {
    fs.rmSync(copy, { force: true })
  }
}
