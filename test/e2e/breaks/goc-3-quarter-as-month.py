# A QUARTER IS DRAWN AS WIDE AS A MONTH.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "the time period offers Day, Week, Month, Quarter and Year, Week to begin with, and each draws a day narrower than the one before it"
#
# Quarter is offered and changes nothing.
import io
p = '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('const DAY_PX: Record<GanttPeriod, number> = { day: 56, week: 28, month: 14, quarter: 5, year: 2 }',
     'const DAY_PX: Record<GanttPeriod, number> = { day: 56, week: 28, month: 14, quarter: 14, year: 2 }'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-3-quarter-as-month: A QUARTER IS DRAWN AS WIDE AS A MONTH.')
