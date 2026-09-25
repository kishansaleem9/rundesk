# A START ASKS FOR NO KEYS, as the unit test states it: a Zoom start with no Zoom keys answers.
# Reddens: unit: integration-connections.personal.test.ts "refuses, naming what is missing, and hands out no consent address"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = "    if (missing.length > 0) {\n      throw new BadRequestException(`${provider} is not configured on this server — missing backend configuration: ${missing.join(', ')}`)\n    }\n"
b = "    void missing\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('osr-4-start-asks-no-keys-unit: the start asks for no keys')
