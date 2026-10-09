# AN OWNER WHO HAS LEFT THE WORKSPACE IS TAKEN FOR ONE WHO MAY READ.
# Re-aimed 9 October: the owner rule is one statement in `calendar-owner.ts` now, which `ownerMayRead` and a person's syncs both ask (`ledger-rows/row-1962`).
# Reddens: unit: calendar-sync.service.test.ts "is no for somebody no longer in the workspace — a platform admin too"
import io
p = '/home/user/rundesk/apps/api/src/modules/calendar-sync/calendar-owner.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  if (!member) return false\n',
     '  if (!member) return true\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cps-3-a-leaver-is-still-asked-unit: a removed owner still reads')
