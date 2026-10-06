# THE SPREADSHEET MERGE ASKS NOTHING OF THE TASK IT WRITES (`found-6-oct/import-merge-writes-tasks-its-importer-may-not-change`).
# Reddens: unit: spreadsheet-import.service.test.ts "a merge asks the write rule of the task it would change, first and outside the row’s transaction: what the rule refuses is that row’s error, and nothing of the row is written (found-6-oct/import-merge-writes-tasks-its-importer-may-not-change)"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '              await this.access.assertMayMerge(this.db, { taskId: targetId, actorId: userId, fields })\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('iss-15-sheet-merge-skips-the-write-rule-unit: the spreadsheet merge skips the task write rule')
