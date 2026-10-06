# DELETING A FIELD — AND EVERY VALUE IN IT — ASKS THE PROJECT ALONE, NOT THE LIST IT IS SCOPED TO (`found-30-sep/field-definition-takes-a-foreign-list`, its review):
# a member shared that list to view deletes it, one refused a private list deletes its field, and one shared a view-only space’s list to edit cannot.
# Reddens: field-writes-by-level: "and renamed and deleted as its own list says: a member shared a list to view, in a space they may edit, renames and deletes none of its fields (403, the share’s reason), nor those of a private list they may not open (403 “This list is private”) — each field, its name and its value as they were (read by SQL) — while one shared a view-only space’s list to edit renames and deletes a field scoped to it (200, read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    if (reader) await this.assertMayDefineFields(workspaceId, def.projectId, reader, def.listId)\n    // Cascade deletes'
b = "    if (reader) await this.assertMayDefineFields(workspaceId, def.projectId, reader) // BROKEN: the field's list is not asked\n    // Cascade deletes"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('fdl-7-deleting-asks-the-project-alone: deleting a field asks the project alone, not the list it is scoped to')
