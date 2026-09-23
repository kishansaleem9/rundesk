# A TIMELINE RULE THAT REFUSES EVERYTHING: not even the admin sees the private space's work on it.
# Reddens: workspace-read-access: "while the admin’s timeline has all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          containerVisibilityFilter(this.db, opts.actor.id, isManager),\n'
b = '          sql`false`,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-7-timeline-shows-nothing: applied")
