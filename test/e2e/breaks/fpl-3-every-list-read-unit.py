# A FIELD IS LISTED WHATEVER ITS LIST, for the unit test of `fieldsOnReadableLists` (`found-6-oct/field-lists-name-a-private-lists-fields`).
# Reddens: unit: field-access.test.ts "leaves out a field of a private list the reader may not open, and keeps the project’s own field and an open list’s — asking each list once"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = "  return fields.filter((f) => f.listId == null || open.has(f.listId))\n"
b = "  return fields // BROKEN: every field, whatever its list\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fpl-3-every-list-read-unit: a field is listed whatever its list")
