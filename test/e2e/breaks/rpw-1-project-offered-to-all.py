# PROJECT IS OFFERED TO EVERYBODY AGAIN, though only a role holding
# project.create may make one: a 403 for a member.
# Reddens: role-permissions-web: "a member is offered Space and not Project, in the Create menu and on a space’s own menu, and Reports"
#   or "a guest is offered neither Space nor Project, nor Reports"
import io
p = '/home/user/rundesk/apps/web/src/lib/create-types.ts'
a = ", isContainer: true, requires: 'project.create' },\n"
b = ', isContainer: true },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-1-project-offered-to-all: Project is offered to everybody')
