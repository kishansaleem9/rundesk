# THE DEFINE RULE ASKS WHETHER THE LIST IS THE PROJECT’S WITH THE TWO IDS THE WRONG WAY ROUND (`found-30-sep/field-definition-takes-a-foreign-list`, its review),
# so it never finds one: no share on the project’s own list decides, and no private list is asked of — the call no check covered.
# Reddens: field-writes-by-level: "a field is made as its own list says: a member refused fields in a view-only space makes one there scoped to the project’s list shared with them to edit (201, stored with that list, read by SQL) — and none scoped to a private list of an open space that they may not open (403 “This list is private”, none made)"
#   or "and renamed and deleted as its own list says: a member shared a list to view, in a space they may edit, renames and deletes none of its fields (403, the share’s reason), nor those of a private list they may not open (403 “This list is private”) — each field, its name and its value as they were (read by SQL) — while one shared a view-only space’s list to edit renames and deletes a field scoped to it (200, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/field-access.ts'
a = '  const ownList = listId != null && (await listOfProject(db, projectId, listId)) ? listId : null\n'
b = '  const ownList = listId != null && (await listOfProject(db, listId, projectId)) ? listId : null // BROKEN: the ids the wrong way round\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-10-the-rule-asks-with-the-ids-swapped: the define rule asks for the list with the ids the wrong way round')
