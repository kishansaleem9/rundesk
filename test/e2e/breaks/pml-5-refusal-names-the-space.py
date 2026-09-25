# A REFUSAL BY A PROJECT GRANT NAMES THE SPACE'S ACCESS INSTEAD.
# Reddens: project-member-levels: "the refusal names the project and the level it gives — not the space's"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
s = io.open(p, encoding='utf-8').read()
a = "        : resolved.source === 'project-member'\n"
b = "        : resolved.source === 'project-member' && params.actorId === ''\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pml-5-refusal-names-the-space: the refusal names the space')
