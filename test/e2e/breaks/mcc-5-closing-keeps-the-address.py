# CLOSING THE DIALOG LEAVES `?settings=` ON THE ADDRESS: a reload opens it again.
# Re-aimed 25 September: closing clears a failed connect's reason too.
# Reddens: meetings-connect-calendar: "the planner’s Accounts page has an address: it opens from it, closing it clears the address, and an address naming no page opens nothing"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    if (!next && (settingsFromAddress || calendarError)) {\n'
b = "    if (!next && (settingsFromAddress || calendarError) && workspaceId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('mcc-5-closing-keeps-the-address: closing keeps the address')
