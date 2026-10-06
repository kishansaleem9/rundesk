# SEARCH'S CUSTOM-FIELD FILTER MATCHES EVERY VALUE ROW OF THE FIELD, as it did (`found-30-sep/search-finds-tasks-by-values-they-no-longer-show`):
# a task moved out of the field's list, or in from another project, is found by a value its fields do not show.
# Reddens: custom-field-access: "search’s custom-field filter finds a task by a value only of a field it has: not a task moved out of the field’s list, nor one moved in from another project, though each still holds the value (read by SQL) — while a task in the field’s list, and one still in the other project, are found"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "      taskHasField(this.db, def),\n"
b = "      undefined, // BROKEN: any task holding a row of the field\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfv-1-search-finds-by-any-row-of-the-field: search finds a task by any value row of the field")
