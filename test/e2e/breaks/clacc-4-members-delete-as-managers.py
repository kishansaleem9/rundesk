# EVERY MEMBER DELETES AS A MANAGER (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The rule counts anybody who is not a guest as somebody who manages the
# workspace: a member deletes another member's clip and the admin's, while a
# guest is still refused theirs.
#
# Reddens: clip-library-access: "a member may not delete another member’s clip or the admin’s — refused, saying who may; they delete their own, and a manager deletes anybody’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = "  return isManagerRole(reader.role) || recordedByReader(meta, reader)\n"
b = "  return reader.role !== 'guest' || recordedByReader(meta, reader)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-4-members-delete-as-managers: a member deletes anybody’s clip')
