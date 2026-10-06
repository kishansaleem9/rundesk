# A CLIP IS ANYBODY'S TO DELETE (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The delete stops asking who recorded the clip: a guest deletes the admin's,
# as they did, and its link goes with it.
#
# Reddens: clip-library-access: "a guest may not delete somebody else’s clip — refused, saying who may, and it stays; they delete their own"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "    if (!mayDeleteClip(head?.Metadata, reader)) throw new ForbiddenException(CLIP_DELETE_REFUSAL)\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-3-anybody-deletes-any-clip: the delete asks nobody')
