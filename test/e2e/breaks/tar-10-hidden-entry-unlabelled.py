# A MASKED ENTRY IS DRAWN AS ITS EMPTY PROJECT: the delegate’s sheet shows a blank where the task they cannot open was.
# Reddens: time-approval-rule: "the approvals page offers the delegate Approve on each timesheet, and shows the private entry as a task they cannot open — and offers the bystander none, saying they are read-only without claiming only admins approve"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-approvals-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '                          {e.hidden ? (\n'
b = '                          {e.hidden && false ? (\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-10-hidden-entry-unlabelled: hidden entries render as a blank project')
