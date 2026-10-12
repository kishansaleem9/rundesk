# A NEW VIEW OPENS BY THE MONTH, NOT THE WEEK.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "the time period offers Day, Week, Month, Quarter and Year, Week to begin with, and each draws a day narrower than the one before it"
#
# ClickUp opens a new Gantt view by the week.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("  const [zoom, setZoom] = useState<GanttPeriod>('week')",
     "  const [zoom, setZoom] = useState<GanttPeriod>('month')"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-2-month-first: A NEW VIEW OPENS BY THE MONTH, NOT THE WEEK.')
