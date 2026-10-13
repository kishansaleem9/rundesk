# A TASK'S HOURS SHARED OVER THE DAYS THE WINDOW SHOWS, not over its own: a
# fortnight-long task piles its fortnight onto the five days a week draws,
# which is what the workload page did before one rule served every reader.
# (`commit-log/log-68bc188-1`, `ledger-rows/row-777`)
# Reddens: unit: workload-spread.test.ts "takes the share over the WHOLE span, so a window that shows part of a task shows part of its hours"
import io
p = '/home/user/rundesk/apps/api/src/modules/reports/workload-spread.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const length = daysBetween(span.from, span.to) + 1\n",
     "  const length = Math.min(daysBetween(span.from, span.to) + 1, days - Math.max(0, daysBetween(start, span.from)))\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('lv-u1-the-share-over-the-window: shared over the days the window shows')
