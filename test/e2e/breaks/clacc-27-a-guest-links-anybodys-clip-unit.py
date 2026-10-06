# A GUEST GETS THE LINK OF ANYBODY'S CLIP (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The link route reads every asker as a member: a guest's link and every share
# of somebody else's clip are made.
#
# Reddens: unit: clips.service.test.ts "a guest is refused the link, and so every share, of a clip they did not record, told which clips are theirs, and no link is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!mayReadClip(head.Metadata, reader)) throw new ForbiddenException(CLIP_READ_REFUSAL)\n'
b = "    if (!mayReadClip(head.Metadata, { ...reader, role: 'member' })) throw new ForbiddenException(CLIP_READ_REFUSAL)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-27-a-guest-links-anybodys-clip-unit: applied')
