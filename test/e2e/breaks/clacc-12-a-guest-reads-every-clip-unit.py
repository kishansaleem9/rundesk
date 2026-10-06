# A GUEST READS EVERY CLIP, AS A MEMBER DOES (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Reddens: unit: clip-access.test.ts "a guest reads only the clips they recorded; anybody else in the workspace reads every clip"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-access.ts'
a = "  return role === 'guest'\n"
b = "  return role === 'nobody'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-12-a-guest-reads-every-clip-unit: applied')
