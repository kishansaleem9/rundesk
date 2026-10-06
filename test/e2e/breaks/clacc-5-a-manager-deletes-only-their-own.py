# A MANAGER DELETES ONLY THE CLIPS THEY RECORDED (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The rule forgets that somebody who manages the workspace may delete any of
# its clips: the manager's delete of a member's clip is refused.
#
# Reddens: clip-library-access: "a member may not delete another member’s clip or the admin’s — refused, saying who may; they delete their own, and a manager deletes anybody’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = "  return isManagerRole(reader.role) || recordedByReader(meta, reader)\n"
b = "  return recordedByReader(meta, reader)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-5-a-manager-deletes-only-their-own: a manager is refused another’s clip')
