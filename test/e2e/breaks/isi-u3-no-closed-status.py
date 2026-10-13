# A LIST OF A TOOL’S OPEN STATUSES GETS NO CLOSED ONE: A DONE TASK HAS NOWHERE TO BE.
# (`found-13-oct/importers-by-sign-in-unbuilt`)
# Reddens: unit: apps/api/src/modules/integrations/app-import/app-import.test.ts "keeps a tool’s statuses in their order, with a closed one added when none closes; a task where its status is, a done one closed"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/app-import/import-tree.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (!rows.some((r) => r.category === 'closed')) {\n",
     '  if (rows.length === 0) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('isi-u3-no-closed-status: A LIST OF A TOOL’S OPEN STATUSES GETS NO CLOSED ONE: A DONE TASK HAS NOWHERE TO BE.')
