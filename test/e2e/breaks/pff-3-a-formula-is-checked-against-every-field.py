# A FORMULA IS CHECKED AGAINST EVERY FIELD OF ITS PROJECT, as it was (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# A formula's names are looked up among the fields on lists its definer may
# read (`fieldsOnReadableLists`). Let them be looked up among all of the
# project's, and a member refused a private list defines a formula over a
# number kept to it (201), and is told a field kept to it "is a formula field".
#
# Reddens: custom-field-access: "a formula the member defines over a field kept to that list is told there is no field called it, in the words for one that does not exist — a number or a formula"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "    const siblings = scope?.reader ? await fieldsOnReadableLists(this.db, scope.workspaceId, allSiblings, scope.reader) : allSiblings\n"
b = "    const siblings = allSiblings // BROKEN: every field of the project\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pff-3-a-formula-is-checked-against-every-field: a formula is checked against every field')
