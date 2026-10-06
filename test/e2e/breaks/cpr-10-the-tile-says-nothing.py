# THE APP CENTER'S TILE SAYS NOTHING OF A DEPARTED OWNER: the sentence is never drawn. (`found-6-oct/calendar-pull-uses-a-leavers-connection`)
# Reddens: calendar-push-reach: "the App Center’s Google Calendar tile says its owner has left the workspace, and to connect it again under one’s own account — where it said connected; the admin’s Outlook tile is as it was"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "          {connection?.health === 'owner_left' && (\n"
b = "          {false && connection?.health === 'owner_left' && (\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cpr-10-the-tile-says-nothing: the tile never says its owner has left')
