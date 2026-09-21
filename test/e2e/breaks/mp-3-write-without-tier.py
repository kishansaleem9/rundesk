# The write leaving with nothing in it.
# Reddens: ai-model-picker: "carrying the chosen tier in its body"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '        body: JSON.stringify({ preferredTier: preferred }),'
b = '        body: JSON.stringify({}),'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the preference PUT goes out with an empty body.')
