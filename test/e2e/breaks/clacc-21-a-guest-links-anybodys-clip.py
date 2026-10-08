# A GUEST GETS THE LINK OF ANYBODY'S CLIP, AND SHARES IT (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The link route reads every asker as a member, who reads every clip: a guest
# holding the admin's key gets its link again, and a share of it, and the link
# plays the admin's clip to whoever holds it.
#
# Reddens: clip-library-access: "a guest may not link, share or copy onto a task somebody else’s clip — refused, saying which clips are theirs, and nothing is made; their own they attach, and its public link is refused as a guest’s (section 11)"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!mayReadClip(head.Metadata, reader)) throw new ForbiddenException(CLIP_READ_REFUSAL)\n'
b = "    if (!mayReadClip(head.Metadata, { ...reader, role: 'member' })) throw new ForbiddenException(CLIP_READ_REFUSAL)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-21-a-guest-links-anybodys-clip: a guest gets the link of any clip')
