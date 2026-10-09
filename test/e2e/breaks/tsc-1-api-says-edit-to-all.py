# THE API ANSWERS "EDIT" TO EVERYBODY WHO CAN OPEN THE TASK.
# Re-aimed 25 September: Full edit is asked where it was offered (`full-edit-enforced-nowhere`).
# Re-aimed 29 September: the capabilities carry `restore` too (`archived-tasks-unarchived-in-place`).
# Re-aimed 8 October: the capabilities carry `estimate`, `tags` and `track` too (`view-only-individual-permissions`).
# Reddens: task-sheet-capabilities: "the API says what each route would: nothing in the view-only space, comments in the comment-only one, the status too on their own task there, and everything where they may edit"
#   or "in a view-only space the sheet offers the member no change: no title to edit, the status and dates disabled, no Archive or Delete, and no comment box"
#   or "in a comment-only space it offers the comment box, and no change to the task"
#   or "on a task assigned to them there it offers the status too — and moving it on saves — and still no other change"
#
# Re-aimed 8 October: the last 2 of these are knock-ons of the same edit, measured on lane 1 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return { edit, progress, comment, full, restore, estimate, tags, track }\n'
b = "    return { edit: edit || actorId !== '', progress, comment, full, restore, estimate, tags, track }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tsc-1-api-says-edit-to-all: edit to all')
