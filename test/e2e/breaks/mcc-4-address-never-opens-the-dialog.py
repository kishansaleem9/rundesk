# THE PLANNER READS THE ADDRESS'S PAGE AND NEVER OPENS THE DIALOG ON IT.
# Reddens: meetings-connect-calendar: "\"Connect Calendar\" opens the planner’s Accounts page, where a calendar is connected — not Settings → Integrations"
#   or "a member is taken there too — Settings sent them back to the start"
#   or "the planner’s Accounts page has an address: it opens from it, closing it clears the address, and an address naming no page opens nothing"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    setSettingsPage(settingsFromAddress)\n    setSettingsOpen(true)\n'
b = '    setSettingsPage(settingsFromAddress)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-4-address-never-opens-the-dialog: the address never opens the dialog')
