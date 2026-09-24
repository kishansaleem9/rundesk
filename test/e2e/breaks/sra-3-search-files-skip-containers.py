# SEARCH'S FILES WITH THE PRIVATE-ITEM RULE ONLY, as they were: a refused space's file found by name.
# Reddens: search-read-access: "a member’s search finds nothing of a space they are refused, of any kind — while it finds every kind in the open space, and the admin’s finds both"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      // whether the caller may open it (measured, a private space's file).\n      containerVisibilityFilter(this.db, userId, isManager),\n"
b = "      // whether the caller may open it (measured, a private space's file).\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-3-search-files-skip-containers: applied")
