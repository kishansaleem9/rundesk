# Check 19 — THE DUPLICATED LIST, drifting.
# The header row loses a column the rows still write, so every cell after it is
# under the wrong heading. Individually plausible; wrong in a spreadsheet.
#
# Reddens: gantt-controls: "with the columns the chart shows"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    const header = ['Task', 'Group', 'Status', 'Priority', 'Start date', 'Due date', 'Days', 'List', 'Project', 'Space']"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    "    const header = ['Task', 'Status', 'Priority', 'Start date', 'Due date', 'Days', 'List', 'Project', 'Space']",
))
print('BROKE 19: the CSV header drops the Group column the rows still write')
