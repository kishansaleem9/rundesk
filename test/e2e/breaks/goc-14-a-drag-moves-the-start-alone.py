# A BAR DRAGGED MOVES ITS START AND LEAVES ITS DUE DATE.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "a bar dragged two days moves both its dates two days, still date-only (read by SQL), and is drawn there when the page is opened again"
#
# Only the start date is in what the drag saves.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    ...(task.startDate ? startMoved(days) : {}),\n    ...(task.dueDate ? dueMoved(days) : {}),\n  })',
     '    ...(task.startDate ? startMoved(days) : {}),\n  })'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-14-a-drag-moves-the-start-alone: A BAR DRAGGED MOVES ITS START AND LEAVES ITS DUE DATE.')
