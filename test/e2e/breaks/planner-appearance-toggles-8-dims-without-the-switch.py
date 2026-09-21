# "Darken non-working hours" stops being consulted: the grid dims every non-working column
# as soon as it has a schedule, whether or not the switch is on. The setting is still
# written, still read back and still moves - it just no longer decides anything, which is
# the SS-V2-02e defect in its original form with the reader added.
# Reddens: planner-appearance-toggles: "the schedule is already on the page - the Holidays
#          calendar reads it - and not one column is dimmed"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
a = '    if (!darkenNonWorking || !workSchedule) return false'
b = '    if (!workSchedule) return false'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('workspace-planner-page.tsx: columns dim whenever a schedule exists, switch or no switch.')
