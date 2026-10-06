# DELETING A FIELD — AND EVERY TASK'S VALUE IN IT — ASKS ONLY THAT THE PROJECT CAN BE OPENED.
# Re-aimed 5 October: the delete asks the field's own list now (the review of `found-30-sep/field-definition-takes-a-foreign-list`), so the line moved, and a check about that list reddens too.
# Measured then on lane 7, 7/10: the three named. The guest's check reddens too, as it would have before: the field the member deletes in the
# first is the one the guest then writes to, which answers 404 for a field that is gone where 403 is due.
# Reddens: field-writes-by-level: "nor renames or deletes a field there (403, the field as it was) — in an open space they rename one"
#   or "a guest defines no field, even on a project shared with them to edit (403, none made), and sets no value on a task shared with them to view (403, none written)"
#   or "and renamed and deleted as its own list says: a member shared a list to view, in a space they may edit, renames and deletes none of its fields (403, the share’s reason), nor those of a private list they may not open (403 “This list is private”) — each field, its name and its value as they were (read by SQL) — while one shared a view-only space’s list to edit renames and deletes a field scoped to it (200, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (reader) await this.assertMayDefineFields(workspaceId, def.projectId, reader, def.listId)\n    // Cascade deletes'
b = '    // Cascade deletes'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("fwl-5-deleting-asks-nothing: deleting a field — and every task's value in it — asks only that the project can be opened")
