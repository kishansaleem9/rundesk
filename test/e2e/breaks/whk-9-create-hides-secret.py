# THE SECRET NEVER SHOWN AT ALL: the one answer that should carry it does not, and a
# receiver can never be configured to check the signature.
# Reddens: webhook-access: "the answer that makes a webhook carries its secret; the list, even the admin’s, says only that it has one"
import io
p = '/home/user/rundesk/apps/api/src/modules/webhooks/webhooks.service.ts'
a = '      .values({ workspaceId, createdById: userId, ...dto, secret })\n      .returning()\n    return row\n'
b = '      .values({ workspaceId, createdById: userId, ...dto, secret })\n      .returning()\n    return withoutSecret(row)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("whk-9-create-hides-secret: applied")
