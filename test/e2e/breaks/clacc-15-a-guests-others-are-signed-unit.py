# EVERY CLIP IS SIGNED BEFORE ITS READER IS ASKED (`found-5-oct/guests-read-and-delete-every-clip`).
#
# A guest's library lists only theirs, but a URL to everybody else's has
# been made on the way.
#
# Reddens: unit: clips.service.test.ts "a guest’s library is the clips they recorded: nobody else’s is listed or signed"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '      if (!mayReadClip(head.Metadata, reader)) return null\n'
b = '      await this.r2.getObjectUrl(key)\n      if (!mayReadClip(head.Metadata, reader)) return null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-15-a-guests-others-are-signed-unit: applied')
