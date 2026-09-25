# A SPACE MADE WITHOUT A LEVEL IS EDIT AGAIN.
# Reddens: full-edit-levels: "a space is Full edit unless told otherwise: made without a level it is `admin`, stored so, and the wizard opens on \"Full edit\""
import io
p = '/home/user/rundesk/apps/api/src/modules/spaces/spaces.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "      (data.defaultPermission as SpaceDefaultPermission | undefined) ?? 'admin'\n"
b = "      (data.defaultPermission as SpaceDefaultPermission | undefined) ?? 'edit'\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-1-default-back-to-edit: a space made without a level is edit again')
