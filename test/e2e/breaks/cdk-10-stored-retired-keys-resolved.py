# A MEMBER RESOLVES EVERY KEY THEIR ROLES STORE: the retired keys are granted as if they gated something.
# Reddens: container-delete-keys: "a role saved while the retired keys were offered is assigned as before, and grants list.delete and nothing for task.delete.any, doc.delete.any or doc.publish"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '      if (isKnownPermission(p.permission)) merged.add(p.permission)\n'
b = '      merged.add(p.permission as Permission)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cdk-10-stored-retired-keys-resolved: unknown stored keys are resolved')
