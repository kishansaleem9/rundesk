# THE READ RULE IS ASKED WITHOUT THE ACCOUNT'S ROLE: a platform admin's connection is refused what they may open.
# Re-aimed 9 October: the owner rule is one statement in `calendar-owner.ts` now, which `ownerMayRead` and a person's syncs both ask (`ledger-rows/row-1962`).
# Reddens: unit: calendar-sync.service.test.ts "is yes for a member who may open it — here a platform admin, by their account’s role"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-owner.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return (await readableTask(db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null\n',
     '  return (await readableTask(db, task.workspaceId, task.id, { id: ownerId, role: account ? null : null })) !== null\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cps-4-the-read-rule-without-the-account-role-unit: the read rule is asked with no role')
