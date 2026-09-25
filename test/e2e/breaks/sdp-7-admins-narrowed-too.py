# The workspace role stops exempting anybody, so a space's Default permission
# narrows workspace admins and managers as well. Set your own workspace's space
# to "View only" and you have locked yourself out of it — a permission column
# that can do that is a foot-gun, not a permission.
# RE-AIMED 24 September: the guest rule now follows the role check in the resolver.
# Re-aimed 25 September: the manager list is stated once now (`role-lists-copied-per-module`); the anchor reads `isManagerRole(...)`.
# Reddens: space-default-permission:
#   "a workspace admin is not narrowed by a space setting, with no explicit grant to lean on"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = """  if (!membership) return null
  if (isManagerRole(membership.role as string)) {
    return { level: 'admin', source: 'workspace-role' }
  }
  const guest = membership.role === 'guest'
"""
b = """  if (!membership) return null
  const guest = membership.role === 'guest'
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('space-default-permission.ts: workspace admins and managers are now narrowed by the space default too.')
