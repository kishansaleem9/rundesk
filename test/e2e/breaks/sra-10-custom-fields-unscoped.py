# THE CUSTOM FIELDS SEARCH OFFERS, UNSCOPED, as they were: every project's fields, and its name.
# Reddens: search-read-access: "the custom fields search offers name no field of a project the member is refused — the admin’s name it"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = '      .where(and(eq(spaces.workspaceId, workspaceId), containerVisibilityFilter(this.db, userId, isManager)))\n'
b = '      .where(eq(spaces.workspaceId, workspaceId))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sra-10-custom-fields-unscoped: applied")
