# A MEMBER RESOLVES EVERY KEY THEIR ROLES STORE: the retired key is granted as if it gated something.
# Reddens: retired-permission-keys: "the admin assigns the older role as before, and it grants webhook.manage and nothing for the retired key"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (isKnownPermission(p.permission)) merged.add(p.permission)\n'
b = '      merged.add(p.permission as Permission)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rpk-4-stored-keys-resolved: unknown stored keys are resolved')
