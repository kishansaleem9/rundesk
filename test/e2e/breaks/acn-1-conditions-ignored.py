# A RULE ACTS WHETHER OR NOT ITS CONDITIONS HOLD.
# (`found-14-oct/automation-conditions-and-actions-unbuilt`)
# Reddens: automation-conditions: "on an urgent task without the tag it does nothing, and its run is logged as skipped with each condition’s verdict — the priority held, the tag did not"
#   or "and its run history shows the skipped run, and how many conditions did not hold"
import io
p = '/home/user/rundesk/apps/api/src/modules/automations/automations.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        if (!verdict.passed) {\n',
     '        if (!verdict.passed && verdict.verdicts.length > 99) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('acn-1-conditions-ignored: A RULE ACTS WHETHER OR NOT ITS CONDITIONS HOLD.')
