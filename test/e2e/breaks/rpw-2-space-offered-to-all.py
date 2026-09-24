# SPACE IS OFFERED TO A GUEST AGAIN, whose role cannot make one.
# Reddens: role-permissions-web: "a guest is offered neither Space nor Project, nor Reports"
import io
p = '/home/user/rundesk/apps/web/src/lib/create-types.ts'
a = "scopedToSpace: false, isContainer: true, requires: 'space.create' },\n"
b = 'scopedToSpace: false, isContainer: true },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rpw-2-space-offered-to-all: Space is offered to everybody')
