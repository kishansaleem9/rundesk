# DELETING A LIST, PROJECT OR FOLDER ASKS EDIT, AS IT DID.
# Reddens: full-edit-levels: "a member deletes a list of their own only with Full edit: in the space whose default is Edit it stays (403, and the refusal says deleting), in the Full edit space it goes"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "      required: action === 'delete' ? 'admin' : 'edit',"
b = "      required: 'edit',"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-10-container-delete-asks-edit: deleting a list, project or folder asks edit, as it did')
