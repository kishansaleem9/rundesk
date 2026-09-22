# Check 10 — COLLAPSING A GROUP IN ONE PANE ONLY.
# The names disappear from the task panel and the bars stay in the chart: the
# two panes read from different sources. This is the shape the check exists for,
# which is why it is asserted on the BARS and not on the names.
#
# Reddens: gantt-controls: "collapsing the group takes its bars out of the chart, not just its names out of the panel"
import io, os
p = os.environ.get('GANTT_SRC', '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx')
s = io.open(p, encoding='utf-8').read()
a = "                  {visibleGroups.map((group) => (\n                    <div key={group.key}>"
assert s.count(a) == 1, s.count(a)
io.open(p, 'w', encoding='utf-8').write(s.replace(
    a,
    "                  {groups.map((group) => (\n                    <div key={group.key}>",
))
print('BROKE 10: the chart pane ignores collapsed groups and keeps drawing their bars')
