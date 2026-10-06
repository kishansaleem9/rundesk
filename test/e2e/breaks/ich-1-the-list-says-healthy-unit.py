# THE INTEGRATIONS LIST SAYS A DEPARTED MEMBER'S CONNECTION IS HEALTHY. (`found-6-oct/calendar-pull-uses-a-leavers-connection`)
# Reddens: unit: integration-connections.health.test.ts "says owner_left of a connection whose owner is no longer in the workspace, or nobody’s, and healthy of a member’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "          : !row.connectedById || !stillIn.has(row.connectedById)\n            ? 'owner_left'\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ich-1-the-list-says-healthy-unit: the integrations list asks nothing of a connection's owner")
