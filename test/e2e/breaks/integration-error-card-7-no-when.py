# last_error_at becomes a stored value nothing reads, so a failure from last
# month is indistinguishable from one from this morning.
# Reddens: "along with when it happened", "and says when it last failed".
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      lastErrorAt: row.lastErrorAt ?? null,"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      lastErrorAt: null,"))
print('[break 7] stopped the connections endpoint returning last_error_at —')
print('          the card cannot say when the failure happened.')
