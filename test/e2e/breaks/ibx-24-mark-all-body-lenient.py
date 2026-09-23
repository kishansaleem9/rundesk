# MARK ALL READ THAT DROPS A WORKSPACE IT CANNOT READ: and reads everything instead.
# Reddens: inbox-scope: "a malformed workspace is refused, and nothing anywhere is marked read"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.controller.ts'
a = "    const { workspaceId } = parseScope(bodyString(body?.workspaceId, 'workspaceId'), undefined)\n    return this.notifications.markAllRead(user.id, { workspaceId })\n"
b = "    const workspaceId = typeof body?.workspaceId === 'string' && UUID.test(body.workspaceId) ? body.workspaceId : undefined\n    return this.notifications.markAllRead(user.id, { workspaceId })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-24-mark-all-body-lenient: applied")
