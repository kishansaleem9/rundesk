# A TASK FAVOURITED WITH ITS PRIVATE FLAG ONLY, as it was: a refused space's task by title.
# Reddens: lookup-read-access: "a member cannot favourite anything of a space they are refused, nor a channel closed to them (404 each, no row) — while they favourite the open ones"
import io
p = '/home/user/rundesk/apps/api/src/modules/favorites/favorites.service.ts'
a = '            inArray(tasks.id, ids),\n            containerVisibilityFilter(this.db, actor.id, actor.isManager),\n'
b = '            inArray(tasks.id, ids),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-3-favourite-tasks-skip-containers: applied")
