# A SCIM TOKEN ROUTE THAT ANSWERS AND MINTS NOTHING: the refusal half with no positive half.
# Reddens: permission-guards: "the admin may"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/scim.controller.ts'
a = '    return this.scim.createToken(workspaceId, user.id, { name: body.name, expiresAt })\n'
b = '    return { name: body.name, expiresAt, workspaceId, by: user.id }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-5-scim-mints-nothing: applied")
