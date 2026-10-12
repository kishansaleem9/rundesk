# A PRESS ON A BAR OPENS NOTHING.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "a press on a bar that does not move it opens the task"
#
# A press that did not move the bar is dropped.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!moved) onOpen?.(task.id)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-15-a-press-opens-nothing: A PRESS ON A BAR OPENS NOTHING.')
