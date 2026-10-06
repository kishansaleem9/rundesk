# A REFUSED DELETE DOES NOT SAY WHO MAY (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The reader is told only that they may not.
#
# Reddens: unit: clips.service.test.ts "a delete by somebody who neither recorded the clip nor manages the workspace is refused, saying who may, and nothing is deleted"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    if (!mayDeleteClip(head?.Metadata, reader)) throw new ForbiddenException(CLIP_DELETE_REFUSAL)\n'
b = "    if (!mayDeleteClip(head?.Metadata, reader)) throw new ForbiddenException('Forbidden')\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-18-a-refused-delete-says-nothing-of-who-unit: applied')
