# THE ADMIN ROW A PROJECT'S MAKER IS SEEDED WITH COUNTS AS A GRANT: making a project is an exception to its space.
# Reddens: project-member-levels: "the admin row a project's maker is seeded with is no grant — the space's View decides — and the same row given by the admin is one"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
s = io.open(p, encoding='utf-8').read()
a = 'roles.find((r) => r.projectId === step.id && r.addedById !== params.actorId)'
b = "roles.find((r) => r.projectId === step.id && (r.addedById !== params.actorId || r.role !== ''))"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pml-2-maker-seed-is-a-grant: the maker seed is a grant')
