# A LINE DOUBLE-CLICKED STAYS.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "and that line double-clicked is taken out (read by SQL) and drawn no more, the others left as they were"
#   "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# Nothing listens for the double-click.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                      onDoubleClick={onUnlink ? () => void onUnlink(link) : undefined}',
     '                      onDoubleClick={undefined}'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-13-double-click-ignored: A LINE DOUBLE-CLICKED STAYS.')
