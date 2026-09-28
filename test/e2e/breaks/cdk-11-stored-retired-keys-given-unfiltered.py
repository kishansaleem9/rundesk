# THE GRANT CHECK READS A ROLE'S STORED KEYS UNFILTERED: the retired keys make the older role unassignable, the admin included.
# Reddens: container-delete-keys: "a role saved while the retired keys were offered is assigned as before, and grants list.delete and nothing for task.delete.any, doc.delete.any or doc.publish"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return rows.map((r) => r.permission).filter(isKnownPermission)\n'
b = '    return rows.map((r) => r.permission)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-11-stored-retired-keys-given-unfiltered: permissionsOfRole returns every stored key')
