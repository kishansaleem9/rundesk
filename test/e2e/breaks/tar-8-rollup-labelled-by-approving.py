# THE MONTHLY ROLLUP IS LABELLED BY WHO APPROVES: the manager’s own months are called all members’.
# Reddens: time-approval-rule: "the Time page links the manager to Approvals and does not call their own months \"all members\" — the admin’s rollup, which is everyone’s, says so"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-time-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const seesEveryone = approvalStatusQuery.data?.seesEveryone ?? false\n'
b = '  const seesEveryone = approvalStatusQuery.data?.canModerate ?? false\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-8-rollup-labelled-by-approving: the label follows canModerate')
