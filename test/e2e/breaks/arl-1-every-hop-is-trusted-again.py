# EVERY HOP IS TRUSTED AGAIN (`found-30-sep/client-address-behind-nginx`).
#
# The adapter is handed Fastify's `trustProxy: true` whenever TRUST_PROXY is
# set, as it was before: every X-Forwarded-For entry is believed and the first,
# the one the client wrote, is its address. Behind nginx a client names its own
# address and walks past every per-address limit and the IP allowlist.
#
# Reddens: auth-route-limits:
#   "through a proxy that appends the address it saw, as nginx does, the API reads the client’s address as the proxy saw it, not the one the client wrote in X-Forwarded-For"
#   "behind the proxy, a client naming a different address in X-Forwarded-For on every sign-in is still counted as the address the proxy saw: of 11 wrong passwords in one minute, 10 are answered 401 and the eleventh is refused with 429"
#   "another client behind the same proxy, in the same minute, has a budget of its own: its sign-in is answered 401, not 429"
#   "after the window the same address is answered again by every route that refused it, and so is the client behind the proxy"
import io
p = '/home/user/rundesk/apps/api/src/main.ts'
a = '    new FastifyAdapter({ logger: false, trustProxy }),\n'
b = '    new FastifyAdapter({ logger: false, trustProxy: trustProxy !== false }),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-1-every-hop-is-trusted-again: every hop is trusted')
