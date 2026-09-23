# THE READ SKIPS THE PRIVATE-ITEM RULE: somebody else's private task is listed for a guest.
# Reddens: workspace-read-access: "and so does a guest"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          taskVisibilityFilter(this.db, actor.id, isManager),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-2-no-private-item-rule: applied")
