import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Fastify from 'fastify'
import { trustProxyFrom, type TrustProxy } from './trust-proxy'

/**
 * WHO IS ASKING, BEHIND NGINX (`found-30-sep/client-address-behind-nginx`).
 *
 * Read the way the API reads it: a Fastify instance built with what
 * `trustProxyFrom` makes of TRUST_PROXY (main.ts passes it to the adapter),
 * asked through `inject` with the socket address and the X-Forwarded-For
 * nginx would hand it. nginx APPENDS the address it saw to the client's own
 * header (`$proxy_add_x_forwarded_for`), so the last entry is nginx's and
 * every entry before it is whatever the client wrote. `auth-route-limits.mjs`
 * measures the same through a real proxy on a lane.
 */

/** Docker's bridge gateway: what the API's socket sees behind nginx and docker-proxy. */
const NGINX = '172.18.0.1'
/** The visitor, as nginx saw it. */
const VISITOR = '203.0.113.9'
/** What the visitor wrote in its own X-Forwarded-For. */
const FORGED = '198.51.100.66'

/** `req.ip` as the API would read it, for a request from `socket` carrying `xff`. */
async function ipSeen(trust: TrustProxy, socket: string, xff?: string): Promise<string> {
  const app = Fastify({ trustProxy: trust })
  app.get('/ip', async (req) => ({ ip: req.ip }))
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: socket,
      headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    })
    return (res.json() as { ip: string }).ip
  } finally {
    await app.close()
  }
}

describe('TRUST_PROXY: the client’s address, behind nginx', () => {
  it('unset, empty, false or 0 trusts no proxy: the address is the socket’s, whatever X-Forwarded-For says', async () => {
    for (const value of [undefined, '', '  ', 'false', 'FALSE', '0']) {
      assert.equal(trustProxyFrom(value), false, `TRUST_PROXY=${JSON.stringify(value)}`)
    }
    assert.equal(await ipSeen(trustProxyFrom(undefined), '10.9.8.7', `${FORGED}, ${VISITOR}`), '10.9.8.7')
  })

  it('1 trusts exactly one hop: behind nginx the address is the one nginx appended, not the one the client wrote', async () => {
    const trust = trustProxyFrom('1')
    assert.equal(trust, 1)
    assert.equal(await ipSeen(trust, NGINX, VISITOR), VISITOR, 'a visitor that wrote no X-Forwarded-For')
    assert.equal(await ipSeen(trust, NGINX, `${FORGED}, ${VISITOR}`), VISITOR, 'a visitor that named another address first')
    assert.equal(await ipSeen(trust, NGINX, `${FORGED}, 10.0.0.1, ${VISITOR}`), VISITOR, 'a visitor that wrote a chain of its own')
    // Two visitors behind the same nginx are two addresses, so two budgets.
    assert.notEqual(await ipSeen(trust, NGINX, '203.0.113.10'), await ipSeen(trust, NGINX, '203.0.113.11'))
  })

  it('true is read as one hop too, never as Fastify’s true, which trusts every hop and answers the address the client wrote', async () => {
    const trust = trustProxyFrom('true')
    assert.equal(trust, 1, 'TRUST_PROXY=true is one proxy')
    assert.equal(await ipSeen(trust, NGINX, `${FORGED}, ${VISITOR}`), VISITOR)
    // What `trustProxy: true` did with the same request: the client chose.
    assert.equal(await ipSeen(true as unknown as TrustProxy, NGINX, `${FORGED}, ${VISITOR}`), FORGED)
  })

  it('a count trusts that many hops: behind a CDN and nginx, 2 answers the address the CDN saw', async () => {
    const CDN_EDGE = '192.0.2.44'
    assert.equal(trustProxyFrom('2'), 2)
    assert.equal(await ipSeen(trustProxyFrom('2'), NGINX, `${FORGED}, ${VISITOR}, ${CDN_EDGE}`), VISITOR)
  })

  it('anything else stops the API at boot, naming the variable', () => {
    for (const value of ['yes', 'on', '-1', '1.5', '1e3', '0x1', '1000', '127.0.0.1', 'loopback', '10.0.0.0/8, 172.16.0.0/12']) {
      assert.throws(() => trustProxyFrom(value), /TRUST_PROXY must be how many proxies/, `TRUST_PROXY=${JSON.stringify(value)} was accepted`)
    }
  })
})
