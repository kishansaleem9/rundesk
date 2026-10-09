# EVERYBODY IS TAKEN FOR AN ASSIGNEE: in a comment-only space, a colleague's task's status changes too.
# Re-aimed 25 September: the call passes the task's chain now (`project-roles-narrow-nothing`).
# Re-aimed 25 September: the write rule is written once now, in `common/permissions/task-write.ts` (`field-values-written-by-readers`).
# Re-aimed 9 October: the space check is written over several lines now, with the view-only switches beside it (`found-25-sep/view-only-individual-permissions`).
# Reddens: task-edit-levels: "a comment-only space lets a member change nothing of a colleague's task, and on a task assigned to them its status alone"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    opts.level ?? 'edit',\n    !!assignee,\n",
     "    opts.level ?? 'edit',\n    !!assignee || actorId !== '',\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tel-4-everyone-an-assignee: everybody is taken for an assignee')
