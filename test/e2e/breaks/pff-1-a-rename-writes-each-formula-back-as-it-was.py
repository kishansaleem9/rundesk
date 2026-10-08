# A RENAME WRITES EACH FORMULA THAT READS THE FIELD BACK AS IT WAS (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# A rename is never refused now: it writes the new name into the text of every
# formula that reads the field, the ones kept to a list the renamer may not
# open among them. Let it write each one back with its old text, and the
# formula on the private list goes on naming a field nothing is called any
# more, where its admin reads it.
#
# Reddens: custom-field-access: "a member renames a field that a formula kept to a list they may not open reads: the rename stands, and the formula reads the new name"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "            .set({ config: { ...cfg, expression }, updatedAt: new Date() })\n"
b = "            .set({ config: { ...cfg }, updatedAt: new Date() })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pff-1-a-rename-writes-each-formula-back-as-it-was: a rename writes no formula its new name')
