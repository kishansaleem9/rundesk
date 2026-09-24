# THE MOVE PICKER'S RESOLVER FORGETS GUESTS: many spaces at once read the
# default for a guest, while one space at a time does not.
# Reddens: guest-space-level: "the Move picker offers a guest only the space shared with them to edit — a member, the open space"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "        : guest\n          ? { level: 'view', source: 'guest-default' }\n          : { level: row.defaultPermission, source: 'space-default' },\n"
b = "        : { level: row.defaultPermission, source: 'space-default' },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-2-picker-forgets-guests: the batch resolver reads the default for a guest')
