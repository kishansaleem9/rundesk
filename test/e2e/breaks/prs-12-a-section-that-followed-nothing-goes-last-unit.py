# ONE THAT FOLLOWED NOTHING STILL IN THE ORDER GOES TO ITS FOOT, not first.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: unit: planner-sections.service.test.ts "one that followed nothing still in the order goes first, and nothing of this workspace is put back"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    let at = 0\n',
     '    let at = out.length // BROKEN: the foot\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-12-a-section-that-followed-nothing-goes-last-unit: ONE THAT FOLLOWED NOTHING STILL IN THE ORDER GOES TO ITS FOOT, not first.')
