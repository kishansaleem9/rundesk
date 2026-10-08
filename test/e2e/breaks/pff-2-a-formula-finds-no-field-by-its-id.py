# A FORMULA READS EACH FIELD IT NAMES BY ITS ID, AND FINDS NONE (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# A formula keeps the id of each field it reads beside the names it shows
# (`compiled`), and is computed by those ids, so a rename leaves it computing
# as before. Let an id find nothing, and the formula on the private list's
# task reads no number from its renamed Budget.
#
# Reddens: custom-field-access: "and the formula still computes from the renamed field on the private list’s task: 20 from a Budget of 10"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "            if (id) return numericById.has(id) ? numericById.get(id)! : null\n"
b = "            if (id) return null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pff-2-a-formula-finds-no-field-by-its-id: a formula reads nothing by id')
