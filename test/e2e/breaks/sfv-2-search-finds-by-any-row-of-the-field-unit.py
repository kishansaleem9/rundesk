# SEARCH'S CUSTOM-FIELD FILTER MATCHES EVERY VALUE ROW OF THE FIELD, as `sfv-1`, for the unit tests of the search service
# (`found-30-sep/search-finds-tasks-by-values-they-no-longer-show`).
# Reddens: unit: search.service.test.ts "finds a task only where it has the field: in a list of the field’s project, and for a field scoped to a list, in that list"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      taskHasField(this.db, def),\n"
b = "      undefined, // BROKEN: any task holding a row of the field\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfv-2-search-finds-by-any-row-of-the-field-unit: search finds a task by any value row of the field")
