# The parser invents a 0 where the expression ran out, so `{Budget} +` saves as
# something that looks deliberate.
# Reddens: custom-field-types: "an expression that does not parse is refused at create time, not at read time"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/formula.ts'
a = "    if (!t) throw new FormulaError('the expression stops early — something is missing after the last operator')\n"
b = '    if (!t) return 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('formula.ts: an expression that stops early is padded with 0 instead of refused.')
