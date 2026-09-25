# "ADD ACCOUNT" OFFERS A CALENDAR THE SERVER CANNOT CONNECT, as a button that works.
# Reddens: meetings-connect-calendar: "\"Add account\" starts connecting a calendar where the server can connect it, and where it cannot, says so and starts nothing — it was a link to Settings → Integrations"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-accounts-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              disabled={connect.isPending || canConnect(provider) !== true}\n'
b = '              disabled={connect.isPending}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-10-add-account-ignores-the-server: Add account ignores the server')
