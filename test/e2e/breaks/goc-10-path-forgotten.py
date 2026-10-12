# THE CRITICAL PATH IS FORGOTTEN WHEN THE PAGE IS OPENED AGAIN.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "and the path stays shown as it was left, the page opened again"
#
# The switch is never kept.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('                writeFlag(LS_CRITICAL_PATH, on === true)\n',
     ''),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-10-path-forgotten: THE CRITICAL PATH IS FORGOTTEN WHEN THE PAGE IS OPENED AGAIN.')
