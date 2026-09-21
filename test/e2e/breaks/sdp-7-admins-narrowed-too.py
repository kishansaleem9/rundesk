# The workspace role stops exempting anybody, so a space's Default permission
# narrows workspace admins and managers as well. Set your own workspace's space
# to "View only" and you have locked yourself out of it — a permission column
# that can do that is a foot-gun, not a permission.
# Reddens: space-default-permission:
#   "a workspace admin is not narrowed by a space setting, with no explicit grant to lean on"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = """  if (!membership) return null
  if (WS_UNRESTRICTED.has(membership.role as string)) {
    return { level: 'admin', source: 'workspace-role' }
  }

  const [member] = await db
"""
b = """  if (!membership) return null

  const [member] = await db
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('space-default-permission.ts: workspace admins and managers are now narrowed by the space default too.')
