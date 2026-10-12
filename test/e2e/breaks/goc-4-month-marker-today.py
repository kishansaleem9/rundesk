# THE MONTH SCALE NAMES ITS MARKER TODAY.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "Today draws the date marker and names it for the scale: Today by the week, Current Month by the month, Current Year by the year"
#
# The marker is named as the week names it.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  month: 'gantt.markerMonth',\n  quarter: 'gantt.markerMonth',",
     "  month: 'gantt.markerToday',\n  quarter: 'gantt.markerMonth',"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-4-month-marker-today: THE MONTH SCALE NAMES ITS MARKER TODAY.')
