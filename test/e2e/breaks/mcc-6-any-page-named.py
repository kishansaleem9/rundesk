# THE ROUTE TAKES ANY `settings` IT IS GIVEN: an address naming no page opens an empty dialog.
# Reddens: meetings-connect-calendar: "the planner’s Accounts page has an address: it opens from it, closing it clears the address, and an address naming no page opens nothing"
import io
p = '/home/user/rundesk/apps/web/src/routes/app.$workspaceId.calendar.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    settings: (PLANNER_SETTINGS_PAGES as readonly string[]).includes(search.settings as string)\n'
b = "    settings: typeof search.settings === 'string' || (PLANNER_SETTINGS_PAGES as readonly string[]).includes(search.settings as string)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-6-any-page-named: any page named is taken')
