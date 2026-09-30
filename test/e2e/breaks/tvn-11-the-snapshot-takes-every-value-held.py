# A TASK'S SNAPSHOT TAKES EVERY VALUE IT HOLDS (`found-30-sep/template-values-find-fields-by-name-alone`, review): a duplicate and Save as
# template take the values of fields the task no longer has, left by a move, and each falls to a field of its name.
# Reddens: create-modal-templates:
#   "a task moved out of the side list keeps its value in the side list’s Stage, which it no longer shows — and a duplicate of it writes that value into no field, the project’s Stage of that name among them, while its Note is copied (read by SQL)"
#   "and saved as a template, it holds no value for that field — only the Note — and applied in the list writes none into the project’s Stage (read by SQL)"
#   "and a task moved in from another project, still holding that project’s Stage, is duplicated without it: nothing goes into this project’s Stage of that name, while the Owner it has here is copied (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        .filter((r) => fieldIsOnTask(r, place))\n'
b = '        // BROKEN: every value the task holds, whether or not it has the field\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-11-the-snapshot-takes-every-value-held: the snapshot takes every value held")
