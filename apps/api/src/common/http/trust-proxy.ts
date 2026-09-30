/**
 * WHO IS ASKING, BEHIND NGINX (`found-30-sep/client-address-behind-nginx`).
 *
 * `req.ip` is the key every per-address rule reads: the rate limiter's
 * counters (sign-in's ten a minute, the public routes' budgets), the
 * workspace IP allowlist, and the address a session records. Production runs
 * the API behind nginx: `deploy/docker-compose.prod.yml` publishes it on
 * loopback only and `deploy/nginx/*.conf` proxies to it. So the socket's
 * address is the same for every visitor: Docker's bridge gateway, since
 * docker-proxy relays the published port, standing in for nginx.
 *
 * nginx says who it saw by APPENDING that address to whatever X-Forwarded-For
 * the client sent (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`).
 * Only the last entry is nginx's; everything before it the client wrote. So
 * the API trusts exactly the hops it has, counted back from the socket
 * (Fastify's `trustProxy` as a number: "Trust the nth hop from the
 * front-facing proxy server as the client"):
 *
 *   TRUST_PROXY unset, '', 'false' or '0'  no proxy in front: `req.ip` is the
 *                                          socket's, and X-Forwarded-For is
 *                                          not read at all
 *   TRUST_PROXY=1                          one proxy, nginx: `req.ip` is the
 *                                          last X-Forwarded-For entry, the
 *                                          address nginx saw
 *   TRUST_PROXY=<n>                        n proxies in front, each appending
 *                                          (a CDN, then nginx: 2)
 *   TRUST_PROXY=true                       one, as 1. It was Fastify's
 *                                          `trustProxy: true`, which trusts
 *                                          EVERY hop and answers the FIRST
 *                                          entry, the one the client wrote:
 *                                          a client named its own address and
 *                                          walked past every per-address limit
 *                                          and the allowlist. A deployment that
 *                                          set it meant "behind nginx".
 *
 * Anything else stops the API at boot, naming the variable. An address list
 * is not accepted: behind Docker the socket is the bridge gateway, not nginx's
 * loopback, and a list wide enough to cover it (the private ranges) would
 * trust a client on a private network too, and walk on into the entries that
 * client wrote.
 */
export type TrustProxy = false | number

export function trustProxyFrom(value: string | undefined): TrustProxy {
  const v = (value ?? '').trim().toLowerCase()
  if (v === '' || v === 'false' || v === '0') return false
  if (v === 'true') return 1
  if (/^[1-9]\d{0,2}$/.test(v)) return Number(v)
  throw new Error(
    `TRUST_PROXY must be how many proxies stand in front of the API (1 behind nginx), or false for none; it is ${JSON.stringify(value)}`,
  )
}

/** One line for the boot log: where the client's address is read from. */
export function describeTrustProxy(trust: TrustProxy): string {
  return trust === false
    ? 'Client address: the socket’s own (TRUST_PROXY unset: no proxy in front)'
    : `Client address: X-Forwarded-For, trusting the ${trust === 1 ? 'one proxy' : `${trust} proxies`} in front (TRUST_PROXY=${trust})`
}
