# A START ASKS FOR NO KEYS, as it did: a provider this server has no application at is answered a consent address with client_id= empty.
# Reddens: oauth-start-readiness: "a start for a provider this server holds no keys for is refused (400) — saying it is not configured and what is missing — and answers no consent address, for every provider providers/status calls unavailable"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = "    if (missing.length > 0) {\n      throw new BadRequestException(`${provider} is not configured on this server — missing backend configuration: ${missing.join(', ')}`)\n    }\n"
b = "    void missing\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('osr-1-start-asks-no-keys: the start asks for no keys')
