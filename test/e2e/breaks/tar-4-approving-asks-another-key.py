# APPROVING ASKS A MANAGER’S OTHER KEY: the manager approves, the member granted time.approval.manage is refused, as WorkspaceAdminGuard refused them.
# Reddens: time-approval-rule: "a member without time.approval.manage approves nothing (403, still submitted) — the manager approves, and so does the member granted it (each recorded as the approver)"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = "  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('time.approval.manage')\n  approveTimesheet("
b = "  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)\n  @RequirePermissions('members.invite')\n  approveTimesheet("
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-4-approving-asks-another-key: approving asks members.invite')
