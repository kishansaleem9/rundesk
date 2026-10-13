# A TASK WITH NO DATE LOADS TODAY, as the workload page counted one: an
# unscheduled task is counted where ClickUp lists it aside.
# (`commit-log/log-68bc188-1`, `ledger-rows/row-777`)
# Reddens: unit: workload-spread.test.ts "gives a task with no date nothing at all: it is unscheduled"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/workload-spread.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  if (!s && !d) return null\n",
     "  if (!s && !d) return { from: dayStart(new Date()), to: dayStart(new Date()) }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lv-u2-a-dateless-task-loads-today: an unscheduled task counted on today')
