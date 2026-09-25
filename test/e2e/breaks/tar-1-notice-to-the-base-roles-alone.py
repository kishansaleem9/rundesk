# THE NOTICE GOES TO THOSE WHOSE BASE ROLE HOLDS THE KEY: a member granted it by a custom role is not told.
# Reddens: time-approval-rule: "the submitter’s \"awaiting approval\" notice reaches the admin, the manager and the member granted time.approval.manage — and not a member without it, nor the submitter"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-roles/custom-roles.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    return [...new Set([...byRole, ...byGrant].map((r) => r.userId))]\n'
b = '    void byGrant\n    return [...new Set([...byRole].map((r) => r.userId))]\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tar-1-notice-to-the-base-roles-alone: custom grants are left out of the holders')
