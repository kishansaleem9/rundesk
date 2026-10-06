# THE DEFINE RULE ASKS NOTHING OF A PRIVATE LIST (`found-30-sep/field-definition-takes-a-foreign-list`, its review): a member refused a private list defines a field
# scoped to it, and renames and deletes the admin’s, its values with it.
# Reddens: field-writes-by-level: "a field is made as its own list says: a member refused fields in a view-only space makes one there scoped to the project’s list shared with them to edit (201, stored with that list, read by SQL) — and none scoped to a private list of an open space that they may not open (403 “This list is private”, none made)"
#   or "and renamed and deleted as its own list says: a member shared a list to view, in a space they may edit, renames and deletes none of its fields (403, the share’s reason), nor those of a private list they may not open (403 “This list is private”) — each field, its name and its value as they were (read by SQL) — while one shared a view-only space’s list to edit renames and deletes a field scoped to it (200, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = "  if (ownList && !(await readableList(db, workspaceId, ownList, reader))) {\n    throw new ForbiddenException('This list is private')\n  }\n"
b = '  // BROKEN: a private list is not asked\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-8-a-private-list-asks-nothing: the define rule asks nothing of a private list')
