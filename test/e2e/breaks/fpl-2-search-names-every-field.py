# SEARCH'S FIELD FILTER OFFERS EVERY FIELD OF A PROJECT THE CALLER MAY OPEN, as it did (`found-6-oct/field-lists-name-a-private-lists-fields`):
# a field scoped to a private list is offered, by name, to a member that list refuses.
# Reddens: custom-field-access: "and search’s field filter leaves it out to the member, the project’s own field still offered — while the admin’s offers it"
import io
p = '/home/user/rundesk/apps/api/src/modules/search/search.service.ts'
a = "    const readable = await fieldsOnReadableLists(this.db, workspaceId, fields, { id: userId, role: actorRole })\n"
b = "    const readable = fields // BROKEN: a field of any list\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fpl-2-search-names-every-field: search's field filter offers a private list's field")
