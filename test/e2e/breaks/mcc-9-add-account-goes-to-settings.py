# "ADD ACCOUNT" LEADS TO SETTINGS → INTEGRATIONS again, which connects no calendar.
# Reddens: meetings-connect-calendar: "\"Add account\" starts connecting a calendar where the server can connect it, and where it cannot, says so and starts nothing — it was a link to Settings → Integrations"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-accounts-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '              onClick={() => connect.mutate(provider)}\n'
b = '              onClick={() => { window.location.href = `/app/${workspaceId}/settings?tab=integrations` }}\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-9-add-account-goes-to-settings: Add account goes to Settings')
