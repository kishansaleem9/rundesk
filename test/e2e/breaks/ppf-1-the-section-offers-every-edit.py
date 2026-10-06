# THE CUSTOM FIELDS SECTION OFFERS ADD FIELD AND EVERY DELETE TO EVERY READER, as it did (`found-6-oct/project-page-offers-field-edits-to-readers`),
# and so before any answer has come, on a page moved to another project.
# Reddens: project-page-controls: "the Custom fields section offers Add field and each field’s delete only as the define rule lets: the admin all of them; a member of a view-only space no Add field, and no delete but on the field kept to the list shared with them to edit; a guest passing through none"
#   and "moving by the sidebar from a project whose fields and statuses the member may change to one they only view, the page offers nothing on the first project’s answer while the second’s is on its way — no Add field, Statuses or field’s delete — and then has the second’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-project-shell-page.tsx'
s = io.open(p, encoding='utf-8').read()
a = "  const mayAdd = caps?.fields === true\n"
b = "  const mayAdd = caps !== null // BROKEN: offered to every reader\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "  const mayChange = (f: CustomFieldDef) => (f.listId ? caps?.lists[f.listId]?.fields === true : mayAdd)\n"
b = "  const mayChange = (_f: CustomFieldDef) => true // BROKEN: every delete offered to every reader\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("ppf-1-the-section-offers-every-edit: Add field and every delete for every reader")
