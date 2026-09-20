# A disclosure that discloses nothing, because it was never hidden.
# Reddens: ai-model-picker: "what it hides is not in the DOM before it is pressed"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '                  {showMoreModels && ('
b = '                  {true && ('
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the "Show more" contents render before the disclosure is opened.')
