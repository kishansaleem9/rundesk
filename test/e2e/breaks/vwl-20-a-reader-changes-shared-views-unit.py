# A READER BELOW EDIT CHANGES THE SHARED VIEWS: the rule asks no level.
# Reddens: unit: view-write.test.ts "a reader below Edit changes no shared view — not the admin’s, not even one they made"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (!(act === 'delete' ? facts.reachesDelete : facts.reachesLevel)) return 'level'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-20-a-reader-changes-shared-views-unit: a reader below edit changes the shared views: the rule asks no level")
