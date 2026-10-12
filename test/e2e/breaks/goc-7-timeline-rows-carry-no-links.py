# THE TIMELINE'S ROWS CARRY NO DEPENDENCY LINES.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart: "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# The workspace timeline draws no line between its tasks, as before it was the one Gantt.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      dependencyLinks: dependencyLinks.get(row.id) ?? [],',
     '      dependencyLinks: [],'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("goc-7-timeline-rows-carry-no-links: THE TIMELINE'S ROWS CARRY NO DEPENDENCY LINES.")
