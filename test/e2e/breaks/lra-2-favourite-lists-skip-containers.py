# A LIST FAVOURITED WITH ITS PRIVATE FLAG ONLY, as it was: a refused space's list by name.
# Reddens: lookup-read-access: "and a favourite of something they can no longer open is not named in their list — while every open one is"
import io
p = '/home/user/rundesk/apps/api/src/modules/favorites/favorites.service.ts'
a = '            inArray(lists.id, ids),\n            containerVisibilityFilter(this.db, actor.id, actor.isManager),\n'
b = '            inArray(lists.id, ids),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-2-favourite-lists-skip-containers: applied")
