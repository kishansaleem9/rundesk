# A REFUSAL TO ADD SAYS "CHANGING", WHICH EDIT MAY.
# Reddens: full-edit-levels: "a refusal says what was refused and what gave the level: adding a task or a list, deleting a task — by the space’s default, a share, a project role"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "    within: params.within,\n    act: 'adding a',\n"
b = '    within: params.within,\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fel-8-adding-said-as-changing: a refusal to add says "changing", which edit may')
