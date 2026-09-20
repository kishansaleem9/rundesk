# Choosing and preferring conflated, so an idle experiment rewrites the default.
# Reddens: ai-model-picker: "and writes NOTHING — an idle experiment must not rewrite your default"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = '                      setTier(m.id)'
b = '                      setTier(m.id)\n                      savePreference.mutate(m.id)'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: merely selecting a tier now persists it as the preferred one.')
