# THE ASK TAKES AN ID THAT CANNOT BE ONE: it records nothing (the column refuses it) and tells the admins about it.
# Reddens: unit: request-access.test.ts "refuses an id that cannot be one before it reads or records anything"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if (!isUuid(objectId)) throw new BadRequestException('Malformed object id')\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('rac-2-an-ask-takes-any-id-unit: the ask takes any id')
