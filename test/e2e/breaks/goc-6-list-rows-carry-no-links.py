# THE LIST'S ROWS CARRY NO DEPENDENCY LINES.
# (`resume-defects/resume-5`)
# Reddens: gantt-one-chart:
#   "a line is drawn from each task to the one waiting on it, from the end of the one bar to the start of the other"
#   "Customize › Critical path draws the group's last task and the tasks it waits on with no day between in red — C, B and A, not D or E — and draws none until it is asked for"
#   "Slack time draws beside each task off the path the days it may slip: two for D, before E needs it, five for E, before the group ends — and none on the path"
#   "a line drawn from the dot at E's end onto C makes C wait on E (read by SQL), and the line is drawn"
#   "and the path stays shown as it was left, the page opened again"
#   "and that line double-clicked is taken out (read by SQL) and drawn no more, the others left as they were"
#   "the workspace timeline draws the same chart: the same lines between the same tasks, its time period, and the critical path as the list’s tab draws it"
#
# The list answers its tasks without the edges between them, so its Gantt tab draws no line, and the path and slack are read with none.
# The line drawn from E is made (read by SQL) and never drawn, so it is never double-clicked away, and the timeline
# then draws it beside the three.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        dependencyLinks: dependencyLinks.get(r.id) ?? [],',
     '        dependencyLinks: [],'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("goc-6-list-rows-carry-no-links: THE LIST'S ROWS CARRY NO DEPENDENCY LINES.")
