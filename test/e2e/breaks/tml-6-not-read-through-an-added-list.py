# NOBODY READS A TASK THROUGH A LIST IT WAS ADDED TO.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "whoever may open one of its lists reads it there: Max, refused it before, reads it by id and in the team list after — its home still Mia’s list, which is not named to him"
#
# A task is read only where it lives, as before the ClickApp.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/read-access.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('export async function readsThroughAddedList(db: Db, workspaceId: string, taskId: string, actor: ReadActor): Promise<boolean> {\n  if (!isUuid(taskId)) return false\n',
     'export async function readsThroughAddedList(db: Db, workspaceId: string, taskId: string, actor: ReadActor): Promise<boolean> {\n  if (!isUuid(taskId) || taskId) return false // BROKEN: never through an added list\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-6-not-read-through-an-added-list: NOBODY READS A TASK THROUGH A LIST IT WAS ADDED TO.')
