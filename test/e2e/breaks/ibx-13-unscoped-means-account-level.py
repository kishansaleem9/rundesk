# NO WORKSPACE READ AS "NO WORKSPACE'S": outside a workspace only account-level rows.
# Reddens: inbox-scope: "while the view outside any workspace still has both workspaces’ rows"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '        ? or(eq(notifications.workspaceId, scope.workspaceId), isNull(notifications.workspaceId))\n        : undefined,\n'
b = '        ? or(eq(notifications.workspaceId, scope.workspaceId), isNull(notifications.workspaceId))\n        : isNull(notifications.workspaceId),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-13-unscoped-means-account-level: applied")
