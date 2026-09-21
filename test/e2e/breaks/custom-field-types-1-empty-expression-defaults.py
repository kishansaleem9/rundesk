# A formula with nothing in it becomes the constant 0 instead of a refusal. The
# field then saves, and draws the same number on every task forever.
# Reddens: custom-field-types: "a formula with no expression is refused, and says so"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/formula.ts'
a = "  if (typeof raw !== 'string') throw new FormulaError('a formula needs an expression')\n  const expression = raw.trim()\n  if (expression === '') throw new FormulaError('a formula needs an expression')\n"
b = "  if (typeof raw !== 'string') raw = '0'\n  const expression = String(raw).trim() === '' ? '0' : String(raw).trim()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('formula.ts: an empty expression silently becomes the constant 0.')
