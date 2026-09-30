# TRUST_PROXY=true TRUSTS EVERY HOP AGAIN (`found-30-sep/client-address-behind-nginx`).
#
# `true` goes through to Fastify as `true`, as `process.env.TRUST_PROXY === 'true'`
# did: every X-Forwarded-For entry is believed and the first, the client's own
# writing, is its address.
#
# Reddens: unit: trust-proxy.test.ts "true is read as one hop too, never as Fastify’s true, which trusts every hop and answers the address the client wrote"
import io
p = '/home/user/rundesk/apps/api/src/common/http/trust-proxy.ts'
a = "  if (v === 'true') return 1\n"
b = "  if (v === 'true') return true as never\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-13-true-trusts-every-hop-unit: true trusts every hop')
