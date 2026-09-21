# Dim the WEEKEND instead of the workspace's schedule. This is the plausible wrong fix:
# for a Monday-to-Friday team the two sets coincide exactly, so it demos perfectly and
# is wrong for every team whose week is not Monday to Friday, and for every holiday.
#
# REDDENS: planner-appearance-toggles.mjs — "exactly the N days outside the schedule are dimmed" and
#          "a Thursday outside the schedule is dimmed while the Monday inside it is not"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-planner-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = '    if (holidays.has(localDayKey(d))) return true\n    return !(workSchedule.workDays ?? []).includes(isoDay(d))'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times, expected exactly 1'
b = '    return d.getDay() === 0 || d.getDay() === 6 // BREAK: the weekend, not the schedule'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('replaced the work-schedule rule with the weekend rule')
