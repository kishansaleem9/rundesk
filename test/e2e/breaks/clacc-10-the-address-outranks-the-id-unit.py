# A CLIP IS WHOEVER HOLDS ITS ADDRESS NOW (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The id the clip carries is ignored: its recorder loses it when their
# address changes, and the next holder of the address gains it.
#
# Reddens: unit: clip-access.test.ts "the recorder is the one whose id the clip carries, whatever address it names"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = '  if (id) return id === reader.id\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-10-the-address-outranks-the-id-unit: applied')
