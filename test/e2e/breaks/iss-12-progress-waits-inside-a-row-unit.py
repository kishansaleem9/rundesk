# A ROW'S TRANSACTION WAITS ON THE POOL FOR ITS PROGRESS WRITE (`found-5-oct/xlsx-read-as-text`): it holds a connection while it waits for another.
# Reddens: unit: spreadsheet-import.service.test.ts "no write waits for a second connection while a transaction holds one"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                await this.applyPeopleAndTags(tx, workspaceId, task.id, r, memberByKey, labelCache, tally)\n                return task.id\n'
b = '                await this.applyPeopleAndTags(tx, workspaceId, task.id, r, memberByKey, labelCache, tally)\n                await this.updateProgress(jobId, processed, summary)\n                return task.id\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("iss-12-progress-waits-inside-a-row-unit: progress is written from inside a row's transaction")
