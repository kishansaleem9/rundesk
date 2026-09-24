# EVERY PROJECT OF A SPACE IS LISTED TO A GUEST who passes through it, the one
# nothing in is shared with them included.
# Reddens: guest-read-scope: "a guest is listed the projects holding what is shared with them, not the project nothing in is shared — a member is listed it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = '    guestProjectFilter(db, actorId),\n  )'
b = '  )'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-3-projects-listed-to-guests: every project of a space is listed to a guest')
