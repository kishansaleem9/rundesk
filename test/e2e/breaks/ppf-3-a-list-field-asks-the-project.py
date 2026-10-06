# A FIELD KEPT TO A LIST IS ANSWERED BY THE PROJECT'S RULE ALONE: the list's own share is not asked (`found-6-oct/project-page-offers-field-edits-to-readers`),
# so a member shared that list to edit, in a view-only space, is not offered its field's delete, which the route would take.
# Reddens: project-page-controls: "the Custom fields section offers Add field and each field’s delete only as the define rule lets: the admin all of them; a member of a view-only space no Add field, and no delete but on the field kept to the list shared with them to edit; a guest passing through none"
import io
p = '/home/user/rundesk/apps/api/src/modules/container-members/container-members.service.ts'
a = "        defineFields(list.id),\n"
b = "        defineFields(), // BROKEN: the list's own share is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ppf-3-a-list-field-asks-the-project: a list's field answered by the project alone")
