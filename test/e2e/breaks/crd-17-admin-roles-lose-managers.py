# THE ADMIN ROLES WITHOUT MANAGERS: a manager may change the domain but not read its record.
# Reddens: credential-reads: "while the admin and the manager, who may change the domain, still read it for the DNS record"
import io
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/workspace-admin.guard.ts'
a = "export const WORKSPACE_ADMIN_ROLES: readonly string[] = ['workspace_admin', 'manager', 'super_admin']\n"
b = "export const WORKSPACE_ADMIN_ROLES: readonly string[] = ['workspace_admin', 'super_admin']\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("crd-17-admin-roles-lose-managers: applied")
