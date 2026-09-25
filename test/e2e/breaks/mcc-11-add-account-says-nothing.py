# "ADD ACCOUNT" GREYS A CALENDAR OUT AND DOES NOT SAY WHY.
# Reddens: meetings-connect-calendar: "\"Add account\" starts connecting a calendar where the server can connect it, and where it cannot, says so and starts nothing — it was a link to Settings → Integrations"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-accounts-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '        {CALENDAR_PROVIDERS.some((provider) => canConnect(provider) === false) && (\n'
b = "        {CALENDAR_PROVIDERS.some((provider) => canConnect(provider) === false) && workspaceId === '' && (\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-11-add-account-says-nothing: Add account says nothing')
