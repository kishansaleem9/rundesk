# THE PROJECT'S ANSWER SAYS EVERYBODY MAY CHANGE ITS FIELDS: the define rule is not asked (`found-6-oct/project-page-offers-field-edits-to-readers`).
# Reddens: project-page-controls: "the Custom fields section offers Add field and each field’s delete only as the define rule lets: the admin all of them; a member of a view-only space no Add field, and no delete but on the field kept to the list shared with them to edit; a guest passing through none"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
a = "      allowed(assertMayDefineFields(this.db, { workspaceId: row.workspaceId, projectId, reader: { id: actorId, role: actorRole }, listId }))\n"
b = "      Promise.resolve(true) // BROKEN: the define rule is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-2-the-answer-offers-every-edit: the fields answer is yes for everybody")
