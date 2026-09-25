# A MEMBER'S GRANTS BELOW THE SPACE ARE READ BY NOTHING, as they were: the space alone decides.
# Reddens: project-member-levels: "a member given View on a project changes nothing in it — not the admin's task, not a new task, not a list, even one they made — where the space alone would let them, as it does in the project beside it"
#   or "a member given Comment on a project comments on its tasks and changes nothing of them"
#   or "a member given Edit on a project in a view-only space changes the admin's task there and makes one — and in the project beside it the space's View still decides"
#   or "the admin row a project's maker is seeded with is no grant — the space's View decides — and the same row given by the admin is one"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
s = io.open(p, encoding='utf-8').read()
a = '  if (!guest && params.within?.length) {\n    const ids = params.within.map((step) => step.id)\n'
b = "  if (!guest && params.within?.length && params.actorId === '') {\n    const ids = params.within.map((step) => step.id)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('pml-1-member-grants-unread: member grants unread')
