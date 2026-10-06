# RENAMING A FIELD ASKS ONLY THAT THE PROJECT CAN BE OPENED.
# Re-aimed 5 October: the rename asks the field's own list now (the review of `found-30-sep/field-definition-takes-a-foreign-list`), so the line moved, and a check about that list reddens too (8/10 on lane 7, the two named).
# Reddens: field-writes-by-level: "nor renames or deletes a field there (403, the field as it was) — in an open space they rename one"
#   or "and renamed and deleted as its own list says: a member shared a list to view, in a space they may edit, renames and deletes none of its fields (403, the share’s reason), nor those of a private list they may not open (403 “This list is private”) — each field, its name and its value as they were (read by SQL) — while one shared a view-only space’s list to edit renames and deletes a field scoped to it (200, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    if (reader) await this.assertMayDefineFields(workspaceId, def.projectId, reader, def.listId)\n    if (patch.options != null'
b = '    if (patch.options != null'
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('fwl-4-renaming-asks-nothing: renaming a field asks only that the project can be opened')
