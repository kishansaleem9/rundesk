# A START REFUSES EVERY PROVIDER: the keys this server holds are never enough.
# Reddens: oauth-start-readiness: "a start for a provider this server holds keys for answers a consent address with its client id and a signed state, for every provider providers/status calls available"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = "    if (missing.length > 0) {\n"
b = "    if (missing.length >= 0) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('osr-3-start-refuses-every-provider: every start is refused')
