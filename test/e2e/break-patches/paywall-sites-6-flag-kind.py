# The dialog stops distinguishing a plan from a switched-off flag, so a person
# who needs a purchase is told an admin can toggle it (and vice versa).
# Reddens: "it is the PLAN talking, not a switched-off flag".
import io
p = '/home/user/rundesk/apps/web/src/components/feature-gate.tsx'
s = io.open(p, encoding='utf-8').read()
a = "      data-gate-kind={planBlocked ? 'plan' : 'flag'}"
assert s.count(a) == 1, f'anchor occurs {s.count(a)} times, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, "      data-gate-kind={'flag'}"))
print('[break 6] pinned the gate dialog to the flag shape in feature-gate.tsx —')
print('          a plan paywall now reports itself as an admin toggle.')
