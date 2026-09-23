# SSO CONFIGURATION ANY MEMBER CAN READ.
# Reddens: permission-guards: "a plain member is refused the SSO configuration"
import io
p = '/home/user/rundesk/apps/api/src/modules/sso/sso.controller.ts'
a = "@UseGuards(JwtAuthGuard, PermissionsGuard)\n@RequirePermissions('sso.manage')\nexport class SsoAdminController {\n"
b = '@UseGuards(JwtAuthGuard)\nexport class SsoAdminController {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("pgd-2-sso-open: applied")
