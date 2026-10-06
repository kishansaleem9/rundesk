# THE TIMELINE OFFERS A BAR BY ITS LIST ALONE (`found-30-sep/timeline-drags-refused-silently`, as the review found
# it): a share on the task, which the write rule reads first, is not read, so a member or a guest given a task at
# Edit in a list they may only view is offered no drag that the PATCH would take from them.
# Reddens: timeline-dates: "a person whose own share on a task lets them change it is offered its drag on the timeline, whatever its list allows them: a member given a task at Edit in a list they may only view, and a guest given one at Edit, each find both handles, and a day’s drag moves the task a day (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          .filter((row) => shared.has(row.id))\n'
b = '          .filter((row) => shared.has(row.id) && false)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("timeline-dates-11-a-task-share-is-not-read: a bar is offered by its list's level alone")
