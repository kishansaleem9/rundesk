# ONLY A MANAGER WHO RECORDED A CLIP MAY DELETE IT (`found-5-oct/guests-read-and-delete-every-clip`).
#
# A recorder who manages nothing loses their own clip, and a manager
# everybody else's.
#
# Reddens: unit: clip-access.test.ts "a clip is deleted by its recorder or by somebody who manages the workspace, and by nobody else"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = '  return isManagerRole(reader.role) || recordedByReader(meta, reader)\n'
b = '  return isManagerRole(reader.role) && recordedByReader(meta, reader)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-13-managers-delete-only-their-own-unit: applied')
