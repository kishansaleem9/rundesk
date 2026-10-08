# A FORMULA IS COMPILED TO THE NAMES IT SHOWS, NOT ITS FIELDS' IDS, READ FROM ITS UNIT TEST (`found-6-oct/field-checks-name-a-private-lists-fields`).
#
# Reddens: unit: formula.test.ts "compiles each reference, however it is spaced, to its field’s id, and evaluates by them"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/formula.ts'
a = "    out += `${expression.slice(at, ref.start)}{#${idOf(ref.name)}}`\n"
b = "    out += `${expression.slice(at, ref.start)}{${ref.name}}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('pff-4-a-formula-is-compiled-to-its-names-unit: a formula is compiled to its names')
