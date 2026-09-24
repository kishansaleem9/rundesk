# THE TIMELINE ASKS THE SPACE AND THE PROJECT ONLY: a private list's dated tasks are drawn.
# Reddens: private-list-reach: "the timeline gives the member no task of the private list, and the open one — the admin’s has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '          taskInReachFilter(this.db, workspaceId, opts.actor.id, isManager),\n'
b = '          containerVisibilityFilter(this.db, opts.actor.id, isManager),\n'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-3-the-timeline-stops-at-the-project: applied")
