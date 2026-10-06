# THE INTEGRATIONS LIST SAYS A DEPARTED MEMBER'S CONNECTION IS HEALTHY: it asks nothing of the owner. (`found-6-oct/calendar-pull-uses-a-leavers-connection`)
# Reddens: calendar-push-reach: "the integrations list says a connection whose owner has left is not theirs to lend any more — `owner_left` for the keeper’s Google Calendar and Zoom, which read healthy while they were a member — and the admin’s Outlook stays healthy"
#   and "the App Center’s Google Calendar tile says its owner has left the workspace, and to connect it again under one’s own account — where it said connected; the admin’s Outlook tile is as it was"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/connections/integration-connections.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "          : !row.connectedById || !stillIn.has(row.connectedById)\n            ? 'owner_left'\n"
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("cpr-9-the-list-says-healthy: the integrations list asks nothing of a connection's owner")
