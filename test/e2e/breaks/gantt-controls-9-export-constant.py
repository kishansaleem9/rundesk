# Checks 18/20/22 — THE EXPORT AS A FACADE. This is the patch that proves the
# export check is real: a download still happens, it is still named correctly,
# it is still a CSV with the right columns — and it says the same thing every
# time, no matter what is on screen.
#
# Reddens: gantt-controls: "and its bytes carry the three tasks this run seeded, by name"
#
# Re-aimed 12 October: the chart is one component now (`components/gantt-chart.tsx`),
# the timeline page's and the list's Gantt tab's (`resume-defects/resume-5`); the line
# moved there with it. Same break.
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/components/gantt-chart.tsx')
s = io.open(p, encoding='utf-8').read()
a = "    const csv = `${lines.join('\\r\\n')}\\r\\n`"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    "    const csv = `${[header.map(csvCell).join(','), '\"Sample task\",\"\",\"todo\",\"normal\",\"\",\"\",\"1\",\"\",\"\",\"\"'].join('\\r\\n')}\\r\\n`",
))
print('BROKE 18/20/22: the export emits the same constant file every time, whatever the chart is showing')
