# THE LIST CATALOGUE WITH ONLY THE PRIVATE-LIST RULE, as it was: a private space's lists, by name.
# RE-AIMED 24 September: the filter is written one rule a line now, with the
# guest's list rule after them; the patch drops the container rule alone.
# Reddens: workspace-read-access: "the workspace’s list catalogue names no list of a space the member is refused — the admin’s names it"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '        containerVisibilityFilter(this.db, actor.id, isManager),\n        listVisibilityFilter(actor.id, isManager),\n        isManager ? undefined : guestListFilter(this.db, actor.id),\n'
b = '        listVisibilityFilter(actor.id, isManager),\n        isManager ? undefined : guestListFilter(this.db, actor.id),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-25-catalogue-skips-containers: applied")
