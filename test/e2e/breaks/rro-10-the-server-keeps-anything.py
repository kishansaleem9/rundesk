# THE SERVER KEEPS WHATEVER ORDER IT IS SENT: a name that is no section, and a repeat, are stored as sent.
# Reddens: rail-reorder: "the server stores no name that is no section and no repeat — each is refused, saying which, and the stored order stays as it was"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    if (patch.railSections !== undefined) {\n'
b = '    if (patch.railSections !== undefined && Boolean(0)) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rro-10-the-server-keeps-anything: railSections unvalidated')
