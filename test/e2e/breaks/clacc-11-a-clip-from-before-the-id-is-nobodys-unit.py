# A CLIP RECORDED BEFORE THE ID IS NOBODY'S (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Every clip of a library from before the rule is lost to its own recorder.
#
# Reddens: unit: clip-access.test.ts "a clip from before the id is its recorder’s by address, and nobody’s without one"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = '  return !!address && !!own && address === own\n'
b = '  return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-11-a-clip-from-before-the-id-is-nobodys-unit: applied')
