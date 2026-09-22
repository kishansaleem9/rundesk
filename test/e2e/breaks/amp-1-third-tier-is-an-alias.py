# The frame's third row, faked: a third LABEL over a model that is already offered.
# The picker looks right, the preference stores fine, and choosing "Max" changes
# nothing about which model answers. Two names for one thing.
# Reddens: ai-model-picker: "to a DIFFERENT model each, not two labels for one"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/model-tiers.ts'
a = """    id: 'max',
    model: 'claude-opus-5',"""
b = """    id: 'max',
    model: 'claude-sonnet-4-6',"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('model-tiers.ts: the Max tier is now a second label over the Deep tier\'s model.')
