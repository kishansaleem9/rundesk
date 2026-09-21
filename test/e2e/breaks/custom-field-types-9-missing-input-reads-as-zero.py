# A formula whose inputs are unfilled reports 0 instead of nothing. That is the
# confident zero: indistinguishable in the UI from a real measurement of zero.
# Reddens: custom-field-types: "on a task whose inputs are unfilled it is null, never 0"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/formula.ts'
a = '    if (sawNull || !Number.isFinite(value)) return null\n'
b = '    if (!Number.isFinite(value)) return null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('formula.ts: a missing input now evaluates to 0.')
