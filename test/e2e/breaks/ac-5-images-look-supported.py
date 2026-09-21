# A tile that can only ever render 0, presented as a real count.
# Reddens: ai-action-categories: "three are marked as something this product cannot do"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai-categories.ts'
a = "  images: 'aiValue.reasonNoImageGeneration',\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-categories.ts: Images is reported as supported, so it renders a confident zero.')
