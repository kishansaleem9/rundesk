# APPROVING GIVES THE TIME PAGE’S EVERYONE-VIEWS: the manager and the delegate see every person’s week and month.
# Reddens: time-approval-rule: "approving gives no one else’s week or month on the Time page: the manager and the delegate see no other person’s hours there — the admin sees everyone’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return isAdminRole(membership?.role)\n'
b = '    return isAdminRole(membership?.role) || (await this.mayApprove(workspaceId, actor))\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-7-approvers-see-everyones-time: approvers see everyone’s time')
