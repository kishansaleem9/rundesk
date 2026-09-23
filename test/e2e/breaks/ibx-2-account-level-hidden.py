# A STRICT WORKSPACE FILTER: a notification that belongs to no workspace is shown in none.
# Reddens: inbox-scope: "B’s list holds B’s three and the same account-level row — nothing of A’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.service.ts'
a = '        ? or(eq(notifications.workspaceId, scope.workspaceId), isNull(notifications.workspaceId))\n'
b = '        ? eq(notifications.workspaceId, scope.workspaceId)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-2-account-level-hidden: applied")
