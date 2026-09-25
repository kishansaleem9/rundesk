# THE PLANNER'S ROUTE DROPS `settings`: the address opens nothing, whatever it names.
# Reddens: meetings-connect-calendar: "\"Connect Calendar\" opens the planner’s Accounts page, where a calendar is connected — not Settings → Integrations"
#   or "a member is taken there too — Settings sent them back to the start"
#   or "the planner’s Accounts page has an address: it opens from it, closing it clears the address, and an address naming no page opens nothing"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.calendar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    settings: (PLANNER_SETTINGS_PAGES as readonly string[]).includes(search.settings as string)\n'
b = "    settings: (PLANNER_SETTINGS_PAGES as readonly string[]).includes(search.settings as string) && search.page === 'never'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-3-address-read-by-nobody: the route drops settings')
