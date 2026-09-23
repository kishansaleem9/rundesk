# A MALFORMED WORKSPACE IGNORED RATHER THAN REFUSED: it answers with every workspace.
# Reddens: inbox-scope: "a malformed workspace is refused with nothing listed, not answered unscoped"
import io
p = '/home/user/rundesk/apps/api/src/modules/notifications/notifications.controller.ts'
a = "    if (!UUID.test(workspaceId)) throw new BadRequestException('workspaceId must be a workspace id')\n    scope.workspaceId = workspaceId\n"
b = '    if (UUID.test(workspaceId)) scope.workspaceId = workspaceId\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ibx-7-bad-scope-ignored: applied")
