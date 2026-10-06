# THE CLIP READER HAS NO ADDRESS (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Who is asking is read without the address the users table holds for them.
#
# Reddens: unit: clip-reader.test.ts "their address is the one the users table holds, and their role their membership’s in the clip’s workspace"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-reader.ts'
a = '    email: row?.email ?? null,\n'
b = '    email: null,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-28-the-reader-has-no-address-unit: applied')
