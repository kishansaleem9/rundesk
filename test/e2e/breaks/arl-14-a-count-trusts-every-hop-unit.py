# A COUNT OF HOPS TRUSTS THEM ALL (`found-30-sep/client-address-behind-nginx`).
#
# TRUST_PROXY=1 is read as "some proxy" and handed on as `true`: behind nginx
# the address is the first entry, the one the client wrote.
#
# Reddens: unit: trust-proxy.test.ts "1 trusts exactly one hop: behind nginx the address is the one nginx appended, not the one the client wrote"
import io
p = '/home/user/rundesk/apps/api/src/common/http/trust-proxy.ts'
a = '  if (/^[1-9]\\d{0,2}$/.test(v)) return Number(v)\n'
b = '  if (/^[1-9]\\d{0,2}$/.test(v)) return true as never\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('arl-14-a-count-trusts-every-hop-unit: a hop count trusts every hop')
