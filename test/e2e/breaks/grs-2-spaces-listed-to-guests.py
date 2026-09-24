# EVERY OPEN SPACE IS LISTED TO A GUEST again, in the spaces listing and the
# sidebar, though nothing in it is shared with them.
# Reddens: guest-read-scope: "a guest is listed the space shared with them and the one holding things shared with them, not the open space — a member is listed it"
#   or "the guest’s sidebar holds the spaces with things shared with them and not the open space, and the shared list opens on its task"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/container-access.guard-helper.ts'
a = "  return and(or(ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces)), guestSpaceFilter(db, actorId))"
b = "  return and(or(ne(spaces.visibility, 'private'), inArray(spaces.id, memberSpaces)))"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('grs-2-spaces-listed-to-guests: every open space is listed to a guest')
