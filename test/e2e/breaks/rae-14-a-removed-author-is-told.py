# A DOC’S AUTHOR IS TOLD OF ITS COMMENTS AFTER LEAVING THE WORKSPACE (`found-6-oct/an-open-socket-outlives-its-access`).
#
# A notification about a doc goes only to someone the doc's read rule lets
# read it now, after membership. Let every notification about a doc through
# and a member removed from the workspace is notified of a comment on the doc
# they wrote, its words included.
#
# Reddens: realtime-access-ends:
#   "a member removed from the workspace is not notified of a comment on a doc they wrote, on their socket or in their inbox, while a member still in it is notified of one on theirs"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notification-reach.ts'
a = "  if (target.entityType === 'doc') return rules.doc(db, workspaceId, target.entityId, recipient)\n"
b = "  if (target.entityType === 'doc') return true\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rae-14-a-removed-author-is-told: a notification about a doc goes to its author wherever they are')
