# THE WORKSPACE TIMELINE HANDS ITS CHART NO LINES.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# The rows carry their lines and the page drops them.
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-timeline-page.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    () => tasks.flatMap((task) => (task.dependencyLinks ?? []).map((l) => ({ id: l.id, blocker: l.blocker, blocked: task.id }))),',
     '    () => tasks.flatMap(() => [] as GanttLink[]),'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-20-the-timeline-draws-no-lines: THE WORKSPACE TIMELINE HANDS ITS CHART NO LINES.')
