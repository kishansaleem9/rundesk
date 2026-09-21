# The server stops sending last_error, so the column becomes a stored value
# that no reader honours — the mirror of the facade.
# Reddens: "and carries the provider's own message, unedited", and every card
#          check that follows it.
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      lastError: row.lastError ?? null,"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      lastError: null,"))
print('[break 2] stopped the connections endpoint returning last_error —')
print('          the column is written and read by nobody.')
