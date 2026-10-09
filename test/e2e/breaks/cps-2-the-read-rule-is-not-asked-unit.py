# A MEMBER'S CONNECTION TAKES EVERY TASK: the read rule is not asked.
# Re-aimed 9 October: the owner rule is one statement in `calendar-owner.ts` now, which `ownerMayRead` and a person's syncs both ask (`ledger-rows/row-1962`).
# Reddens: unit: calendar-sync.service.test.ts "is no for a member refused the task’s private space"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-owner.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  return (await readableTask(db, task.workspaceId, task.id, { id: ownerId, role: account?.role })) !== null\n',
     '  void account\n  return true\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cps-2-the-read-rule-is-not-asked-unit: the read rule is not asked')
