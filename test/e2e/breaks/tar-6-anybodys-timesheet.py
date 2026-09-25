# ANYBODY’S TIMESHEET IS APPROVED: a row is written for someone outside the workspace.
# Reddens: time-approval-rule: "an approver approves no timesheet of someone outside the workspace (404, no row written), and a malformed person is refused by name, not a 500"
import io
p = '/home/user/rundesk/apps/api/src/modules/time-entries/time-entries.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    if (!member) throw new NotFoundException('No member of this workspace has that timesheet')\n"
b = '    void member\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-6-anybodys-timesheet: the member check is gone')
