# The chip renders the NUMBER OF CALENDARS instead of the number switched on —
# the facade class exactly: correct-looking, and unable to say anything else.
# Reddens: calendar-accounts: "the chip counts the calendars that are ON"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '    (n, g) => n + g.calendars.filter((c) => c.checked).length,\n'
b = '    (n, g) => n + g.calendars.length,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: the calendar chip counts rows, not ticks.')
