# The providers with no client offered as if they worked.
# Reddens: ai-model-picker: "pressing it reveals exactly the two unreachable providers"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '                          data-available="false"'
b = '                          data-available="true"'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: ChatGPT and Gemini are presented as available models.')
