# A CONTAINER RULE THAT REFUSES EVERYTHING: not even the admin reads their own tasks.
# Reddens: workspace-read-access: "while the admin, whose tasks they are and who may open everything, reads all three"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          containerVisibilityFilter(this.db, actor.id, isManager),\n'
b = '          sql`false`,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-4-nobody-reads-anything: applied")
