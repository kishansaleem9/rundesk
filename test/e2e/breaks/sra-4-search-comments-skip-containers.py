# SEARCH'S COMMENTS WITH THE PRIVATE-ITEM RULE ONLY, as they were: a refused space's comment, and its task's title.
# Reddens: search-read-access: "a member’s search finds nothing of a space they are refused, of any kind — while it finds every kind in the open space, and the admin’s finds both"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '            ilike(taskComments.body, like),\n            containerVisibilityFilter(this.db, userId, isManager),\n'
b = '            ilike(taskComments.body, like),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-4-search-comments-skip-containers: applied")
