# THE TIMELINE SKIPS THE CONTAINER RULE, as it did: a private space's dated tasks are on everybody's timeline.
# Reddens: workspace-read-access: "a member’s timeline has nothing from a space they are refused, nor a private task — while the rest are on it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          containerVisibilityFilter(this.db, opts.actor.id, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-5-timeline-no-container-rule: applied")
