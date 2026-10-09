# THE ORDER SAVED FROM ONE WORKSPACE PUTS NONE OF ANOTHER'S SECTIONS BACK.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: unit: planner-sections.service.test.ts "the order saved from one workspace keeps another workspace’s sections after the key each followed"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner-sections.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!foreign(key) || out.includes(key)) return\n',
     '    if (key.length >= 0 || !foreign(key) || out.includes(key)) return // BROKEN: none put back\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("prs-11-the-order-forgets-other-workspaces-unit: THE ORDER SAVED FROM ONE WORKSPACE PUTS NONE OF ANOTHER'S SECTIONS BACK.")
