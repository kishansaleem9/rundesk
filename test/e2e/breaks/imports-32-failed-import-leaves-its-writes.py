# A FAILED IMPORT LEAVES WHAT IT WROTE (`found-5-oct/xlsx-read-as-text`): nothing is taken away when the run fails, so the space, the
# project, the list, the tasks and the tag written before its last write stay.
# Reddens: imports: "an import the database refuses at its last write ends failed and leaves nothing behind: no space, project, list, task or tag of it is there"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      const left = await this.undoRun(made)\n'
b = '      const left = await this.undoRun({ labelIds: [] })\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('imports-32-failed-import-leaves-its-writes: a run that fails takes nothing away')
