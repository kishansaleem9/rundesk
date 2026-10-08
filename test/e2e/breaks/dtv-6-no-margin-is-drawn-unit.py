# The days a chart draws are only those in view, with no margin either side
# (`found-6-oct/timeline-and-gantt-draw-a-column-per-day`): a scroll reaches the
# edge of what is drawn before the next days are.
#
# Reddens: unit: drawn-days.test.ts "holds its margin wherever the scroll stands, and moves only by a step"
import io
p = '/home/user/rundesk/apps/web/src/lib/drawn-days.ts'
a = "  const margin = Math.max(viewWidth, 600)\n"
b = "  const margin = 0\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dtv-6-no-margin-is-drawn-unit: no margin is drawn')
