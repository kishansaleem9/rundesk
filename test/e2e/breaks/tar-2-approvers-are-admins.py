# WHO APPROVES IS ASKED OF THE ADMIN RULE, AS canModerateApprovals DID: the manager and the delegate are shown their own sheets, read-only.
# Reddens: time-approval-rule: "the manager and the member granted time.approval.manage are shown every timesheet and may act on them — a member without it sees their own, read-only"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    return this.roles.hasPermission(workspaceId, actor.id, 'time.approval.manage')\n"
b = '    return this.seesEveryonesTime(workspaceId, actor)\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-2-approvers-are-admins: approving is the admins’')
