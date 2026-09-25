# THE PAGE SAYS ONLY ADMINS APPROVE, AS IT DID: the bystander is told what the API no longer does.
# Reddens: time-approval-rule: "the approvals page offers the delegate Approve on each timesheet, and shows the private entry as a task they cannot open — and offers the bystander none, saying they are read-only without claiming only admins approve"
import io
p = '/home/user/rundesk/apps/web/src/lib/i18n/catalogs.ts'
s = io.open(p, encoding='utf-8').read()
a = "  'timeApprovals.readOnlyNote': 'You can see your own timesheets here. Approving or rejecting them takes the Manage time approvals permission, which managers hold and an admin can grant.',\n"
b = "  'timeApprovals.readOnlyNote': 'You can review submitted timesheets here, but only workspace admins can approve or reject entries.',\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-9-admins-only-says-the-page: the old sentence is back')
