# PDF AND PNG EXPORT ON EVERY PLAN.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "on Pro, PDF and PNG open the plan’s gate naming Business and download nothing, while the CSV of the same rows stays free"
#
# The picture no longer asks the plan.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      if (!mayExportPicture()) return\n      const first = startMs\n',
     '      const first = startMs\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-17-the-picture-ungated: PDF AND PNG EXPORT ON EVERY PLAN.')
