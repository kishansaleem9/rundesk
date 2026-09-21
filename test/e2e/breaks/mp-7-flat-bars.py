# Speed and Intelligence bars that carry no information.
# Reddens: ai-model-picker: "the Fast tier’s Speed bar is visibly longer than the Deep tier’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/model-tiers.ts'
a = '    speed: 5,\n    intelligence: 3,'
b = '    speed: 3,\n    intelligence: 3,'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('model-tiers.ts: the Fast tier scores the same speed as the Deep tier.')
