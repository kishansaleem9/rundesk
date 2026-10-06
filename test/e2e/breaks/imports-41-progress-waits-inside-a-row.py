# A ROW'S TRANSACTION WAITS ON THE POOL FOR ITS PROGRESS WRITE (`found-5-oct/xlsx-read-as-text`): each import holds a connection while
# it waits for another, so with more imports than the API has connections every one of them waits for ever, and every
# route of the API with them. It is the suite's last check, so only the teardown follows, and that waits on no lock for
# long; the lane's API has to be restarted after the run (measured: 42/43, 241 s).
# Reddens: imports: "twelve imports at once, more than the API holds connections, all complete — and the API answers while they run"
import io
p = '/home/user/rundesk/apps/api/src/modules/integrations/clickup-import/spreadsheet-import.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '                await this.applyPeopleAndTags(tx, workspaceId, task.id, r, memberByKey, labelCache, tally)\n                return task.id\n'
b = '                await this.applyPeopleAndTags(tx, workspaceId, task.id, r, memberByKey, labelCache, tally)\n                await this.updateProgress(jobId, processed, summary)\n                return task.id\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("imports-41-progress-waits-inside-a-row: progress is written from inside a row's transaction")
