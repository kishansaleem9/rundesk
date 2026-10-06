# A TILE THE VIEWER CANNOT CONNECT OFFERS CONNECT, not a request.
# Reddens: settings-role-grants: "the App Center offers the plain member no live switch for Slack — it says who connects apps, and offers to ask — while the holder’s switch is live, with Connect"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-integrations-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const asks = known && (!supported || (mayConnect === false && !connected))\n'
b = '  const asks = known && !supported\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('srg-18-connect-for-everyone: Connect for everyone')
