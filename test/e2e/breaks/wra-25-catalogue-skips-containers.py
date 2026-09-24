# THE LIST CATALOGUE WITH ONLY THE PRIVATE-LIST RULE, as it was: a private space's lists, by name.
# Reddens: workspace-read-access: "the workspace’s list catalogue names no list of a space the member is refused — the admin’s names it"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '      visFilter = and(containerVisibilityFilter(this.db, actor.id, isManager), listVisibilityFilter(actor.id, isManager))\n'
b = '      visFilter = listVisibilityFilter(actor.id, isManager)\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-25-catalogue-skips-containers: applied")
