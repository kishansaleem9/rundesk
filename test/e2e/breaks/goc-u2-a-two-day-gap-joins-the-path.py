# A BLOCKER TWO DAYS BEFORE JOINS THE PATH.
# (`resume-defects/resume-5`)
# Reddens: unit: gantt.test.ts "walks back through blockers that leave no gap, and stops at the first one that does"
#
# A day between them is read as none.
import io
p = '/home/user/rundesk/apps/web/src/lib/gantt.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (node.start - blocker.end <= 1) walk.push(b)',
     '      if (node.start - blocker.end <= 2) walk.push(b)'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-u2-a-two-day-gap-joins-the-path: A BLOCKER TWO DAYS BEFORE JOINS THE PATH.')
