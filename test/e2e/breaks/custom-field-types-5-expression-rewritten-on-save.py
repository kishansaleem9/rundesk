# The stored expression is not the one that was typed: whitespace is stripped on
# the way in, so what the person wrote and what the field holds differ.
# Also reddens the panel check that draws the expression back.
#
# Re-aimed 8 October: a formula now keeps the ids of the fields it names beside
# the expression it shows (`found-6-oct/field-checks-name-a-private-lists-fields`),
# so the line returns both; the expression shown is still the one stripped here.
#
# Reddens: custom-field-types: "a well-formed formula is created and the expression is stored verbatim"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = '    return { expression: parsed.expression, compiled: compileFormula(parsed.expression, (name) => idOf.get(name)!) }\n'
b = "    return { expression: parsed.expression.replace(/\\s+/g, ''), compiled: compileFormula(parsed.expression, (name) => idOf.get(name)!) }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('custom-fields.service.ts: the stored expression is rewritten on save.')
