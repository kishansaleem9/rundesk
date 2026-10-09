# THE PERSON'S OWN SECTIONS ARE DRAWN AT THE FOOT WHATEVER THE ORDER SAYS.
# (`commit-log/log-716d25c-1`, `ledger-rows/row-835`)
# Reddens: planner-rail-sections: "dragged above Priorities on the Sidebar page, it is first in the rail, and the order is kept"
#   or "an order saved from the other workspace keeps this one’s section where it stood, and each rail draws only its own"
import io
p = '/home/user/rundesk/apps/web/src/components/planner-settings-dialog.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      const section = RAIL_SECTIONS.find((s) => s === name) ?? ownKeys.find((k) => k === name)\n',
     '      const section = RAIL_SECTIONS.find((s) => s === name) // BROKEN: own sections not placed\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('prs-w5-own-sections-stay-at-the-foot: own sections stay at the foot')
