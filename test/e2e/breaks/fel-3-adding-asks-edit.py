# ADDING TO A SPACE ASKS EDIT, AS IT DID.
# Reddens: full-edit-levels: "where a space’s default is Edit a member changes the admin’s task and archives one, and adds no task or list and deletes no task (403 each, none made, none in the Trash) — in a Full edit space they add and delete"
#   or "a refusal says what was refused and what gave the level: adding a task or a list, deleting a task — by the space’s default, a share, a project role"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "    required: 'admin',\n    kind: params.kind,\n    within: params.within,\n    act: 'adding a',\n"
b = "    required: 'edit',\n    kind: params.kind,\n    within: params.within,\n    act: 'adding a',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-3-adding-asks-edit: adding to a space asks edit, as it did')
