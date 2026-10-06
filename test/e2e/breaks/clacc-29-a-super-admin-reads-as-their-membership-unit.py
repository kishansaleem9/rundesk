# A PLATFORM SUPER ADMIN READS AS THEIR MEMBERSHIP (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The clip reader's role is the membership's alone, where the workspace guards
# make a platform super admin 'super_admin': one who also holds a guest
# membership is let into the workspace as a super admin, and then listed,
# found and linked only the clips they recorded.
#
# Reddens: unit: clip-reader.test.ts "a platform super admin reads as one, whatever their membership, as the workspace guards make them; no membership is no role"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-reader.ts'
a = "    role: row?.platformRole === 'super_admin' ? 'super_admin' : (row?.role ?? null),\n"
b = '    role: row?.role ?? null,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-29-a-super-admin-reads-as-their-membership-unit: applied')
