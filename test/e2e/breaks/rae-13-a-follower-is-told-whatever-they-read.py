# A FOLLOWER IS TOLD ABOUT A TASK WHATEVER THEY MAY READ (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A notification about a task goes only to someone the task's read rule lets
# read it now. Let every notification about a task through and the five whose
# access ended are each notified of a comment on the task they followed, on
# their open socket and in their inbox.
#
# Reddens: realtime-access-ends:
#   "a follower of a task whose access to it ended — removed from the workspace, lowered to guest, a guest unshared, a member of a list or a space made private — is notified of nothing about it after, on their open socket or in their inbox, while a workspace admin who follows the same tasks is notified of each"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notification-reach.ts'
a = "  if (target.entityType === 'task') return rules.task(db, workspaceId, target.entityId, recipient)\n"
b = "  if (target.entityType === 'task') return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-13-a-follower-is-told-whatever-they-read: a notification about a task goes to every follower')
