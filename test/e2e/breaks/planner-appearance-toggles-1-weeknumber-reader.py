# THE FACADE PATCH. The control stays — the switch is still drawn, still flips, still
# saves, still reads back — and only the READER is reverted to what it was before this
# item: a stored value nothing honours. If the suite still passes after this, the suite
# is testing the switch and not the calendar, which is the whole defect it exists for.
#
# Reddens: planner-appearance-toggles: "turning it on puts THIS week's number in the header"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '  const showWeekNumbers = settings?.showWeekNumbers === true'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '  const showWeekNumbers = false // BREAK: stored, saved, read by nothing'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('reverted the showWeekNumbers READER only; the Appearance switch is untouched')
