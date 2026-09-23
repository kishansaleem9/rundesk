# THE TIMELINE SKIPS THE PRIVATE-ITEM RULE: somebody else's private task is on a guest's timeline.
# Reddens: workspace-read-access: "and neither does a guest’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          taskVisibilityFilter(this.db, opts.actor.id, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-6-timeline-no-private-item-rule: applied")
