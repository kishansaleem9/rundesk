# EVERY CLIP OF THE WORKSPACE IS A GUEST'S, LISTED AND SIGNED (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The library stops asking whether its reader may see a clip: a guest is
# listed every clip again, each with a signed URL that serves its bytes, as a
# member is.
#
# Reddens: clip-library-access: "a guest’s library is the clips they recorded and nobody else’s, each signed for them — a member’s lists every clip"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = "      if (!mayReadClip(head.Metadata, reader)) return null\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-1-guests-list-every-clip: the library lists a guest every clip')
