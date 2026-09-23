# SCIM TOKENS BEHIND A PERMISSION ONLY ADMINS HOLD: the `sso.manage` grant does not reach them.
# Reddens: permission-guards: "and so may the member granted `sso.manage` — the permission decides, not the role"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/scim.controller.ts'
a = "@UseGuards(JwtAuthGuard, PermissionsGuard)\n@RequirePermissions('sso.manage')\nexport class ScimAdminController {\n"
b = "@UseGuards(JwtAuthGuard, PermissionsGuard)\n@RequirePermissions('workspace.delete')\nexport class ScimAdminController {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-4-scim-admins-only: applied")
