# NO HOP IS TRUSTED (`found-30-sep/client-address-behind-nginx`).
#
# The adapter trusts no proxy whatever TRUST_PROXY says, as production ran with
# it unset: behind nginx every visitor is the proxy's one address, so each
# per-address limit is one budget for the whole site, and the IP allowlist sees
# nginx. A client forging X-Forwarded-For is still held to sign-in's ten, but
# as the proxy, together with everybody else.
#
# Reddens: auth-route-limits:
#   "through a proxy that appends the address it saw, as nginx does, the API reads the client’s address as the proxy saw it, not the one the client wrote in X-Forwarded-For"
#   "another client behind the same proxy, in the same minute, has a budget of its own: its sign-in is answered 401, not 429"
import io
p = '/home/user/rundesk/apps/api/src/main.ts'
a = '    new FastifyAdapter({ logger: false, trustProxy }),\n'
b = '    new FastifyAdapter({ logger: false, trustProxy: false }),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-2-no-hop-is-trusted: no proxy is trusted')
