# THE WEB KEEPS EVERY FIELD OF THE PROJECT FOR A LIST (`found-30-sep/field-route-takes-another-projects-field`): `fieldsOfList` leaves nothing out,
# so a field scoped to another list is offered again.
# Reddens: unit: field-scope.test.ts "keeps the project’s fields and this list’s own, and leaves out one scoped to another list"
import io
p = '/home/user/rundesk/apps/web/src/lib/field-scope.ts'
a = "  return fields.filter((f) => fieldIsOnList(f, listId))\n"
b = "  return [...fields] // BROKEN: every field of the project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("frt-11-the-list-keeps-every-field-unit: fieldsOfList keeps every field of the project")
