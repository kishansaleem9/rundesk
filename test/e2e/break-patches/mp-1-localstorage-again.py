# The preference back in the browser instead of on the server.
# Reddens: ai-model-picker: "a browser that has never seen this account opens on the preferred tier"
import io
p = '/home/user/rundesk/apps/web/src/components/ai-panel.tsx'
a = "    setTier(preferenceQuery.data?.preferredTier ?? 'deep')"
b = "    setTier('deep')"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ai-panel.tsx: the composer ignores the stored preference and always opens on "deep".')
