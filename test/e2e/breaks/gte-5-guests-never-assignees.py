# A GUEST IS NEVER TAKEN FOR THE ASSIGNEE THEY ARE.
# Re-aimed 9 October: the space check is written over several lines now, with the view-only switches beside it (`found-25-sep/view-only-individual-permissions`).
# Reddens: guest-task-edits: "on a task shared to comment and assigned to them a guest moves the status — read back — and does not rename it (403)"
#   or "the task beside them, shared with nobody, is not theirs (403 “This is not shared with you”, as its read is refused; unchanged; its capabilities refused); and the API answers each shared task by its share: nothing, comments, the status on theirs, every change — and at Edit no delete, which takes Full edit"
#
# Re-aimed 9 October: the last 1 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-write.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    opts.level ?? 'edit',\n    !!assignee,\n",
     "    opts.level ?? 'edit',\n    !!assignee && membership.role !== 'guest',\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('gte-5-guests-never-assignees: a guest is never taken for the assignee they are')
