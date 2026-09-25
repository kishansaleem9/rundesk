# THE GRANT CHECK READS A ROLE’S STORED KEYS UNFILTERED: a key that left the catalog makes the older role unassignable, the admin included.
# Reddens: retired-permission-keys: "the admin assigns the older role as before, and it grants webhook.manage and nothing for the retired key"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return rows.map((r) => r.permission).filter(isKnownPermission)\n'
b = '    return rows.map((r) => r.permission)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('rpk-3-stored-keys-given-unfiltered: permissionsOfRole returns every stored key')
