# THE SNAPSHOT ASKS THE LIST ALONE (`found-30-sep/template-values-find-fields-by-name-alone`, review): a value of a field of another project,
# which a task moved in from it still holds, is taken, and falls to this project's field of its name.
# Reddens: create-modal-templates:
#   "and a task moved in from another project, still holding that project’s Stage, is duplicated without it: nothing goes into this project’s Stage of that name, while the Owner it has here is copied (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = '        .filter((r) => fieldIsOnTask(r, place))\n'
b = '        .filter((r) => fieldIsOnList(r, place.listId)) // BROKEN: the project is not asked\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-12-the-snapshot-asks-the-list-alone: the snapshot asks the list alone")
