# THE TASK WRITE RULE TELLS A USER OF ANOTHER ORGANISATION "Workspace not found" AGAIN, where a task that is not
# there is "Task not found" — so every write route with no guard says whether an id is somebody's task.
# Reddens: refused-as-missing: "a user of another organisation writing to this workspace’s task — changing, moving, binning, restoring or archiving it, taking it on, setting it to repeat, or in the bulk editor — is told it is not there, in the words an id naming nothing gets, and nothing changes"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
a = "  if (!membership) throw notThere()\n"
b = "  if (!membership) throw new NotFoundException('Workspace not found')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ram-14-a-stranger-is-told-no-workspace: the write rule tells a stranger "Workspace not found"')
