# A ROLE IS SAVED WITH ANY KEY IT IS SENT: the retired key is stored as if it meant something.
# Reddens: retired-permission-keys: "a role holding the retired key is refused by name (400) and none is made"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (!isKnownPermission(trimmed)) {\n        throw new BadRequestException(`Unknown permission: ${trimmed}`)\n      }\n      seen.add(trimmed)\n'
b = '      seen.add(trimmed as Permission)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rpk-2-unknown-keys-accepted: unknown keys pass validation')
