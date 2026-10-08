# The timeline labels a day cell with the date of `start + i × 24 h` again
# (`found-8-oct/timeline-day-labels-slip-after-the-clock-goes-back`).
#
# After the clock goes back on 1 November that instant is 23:00 of the day
# before, so in Los Angeles every cell from then on reads the day before the
# one it stands for, while the bars stand on their own days.
#
# Reddens: timeline-dates: "in Los Angeles, at Day zoom, a task of 10 November sits under the cell “Nov 10”, after the clock goes back on 1 November as before it"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
a = "      const at = addDays(startMs, i)\n"
b = "      const at = startMs + i * 86400_000\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtv-5-a-days-label-slips-after-the-clock-goes-back: a day cell is labelled start + i × 24 h')
