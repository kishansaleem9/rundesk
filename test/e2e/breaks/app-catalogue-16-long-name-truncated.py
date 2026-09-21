# The bound becomes a silent trim. The admin is handed a name nobody typed, and
# the person who typed it is told it worked.
# Reddens: app-catalogue: "and an over-long name is refused in the service's own
#          words"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
a = """    if (provider.length > IntegrationConnectionsService.MAX_PROVIDER_LENGTH) {
      throw new BadRequestException(
        `App name is too long: ${IntegrationConnectionsService.MAX_PROVIDER_LENGTH} characters at most`,
      )
    }
"""
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('integration-connections.service.ts: an over-long app name is accepted in silence.')
