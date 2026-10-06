# A MERGE HOLDS ITS TASK WHILE THE RUN GOES ON (`found-5-oct/xlsx-read-as-text`): the merged task stays locked for 8 s after its row, as
# it stayed locked to the end of a run written as one transaction, so an edit of it waits.
# Reddens: imports: "a task an import has merged can be edited while the import runs on: the edit answers at once"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                  .set({ ...mergeSet(r, mapping), updatedAt: new Date() })\n                  .where(eq(tasks.id, targetId))\n'
b = '                  .set({ ...mergeSet(r, mapping), updatedAt: new Date() })\n                  .where(eq(tasks.id, targetId))\n                await new Promise((resolve) => setTimeout(resolve, 8000))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-42-a-merge-holds-its-task: a merged task stays locked after its row')
