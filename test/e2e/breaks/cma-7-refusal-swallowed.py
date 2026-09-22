# The provider's own words are replaced by a house sentence, so 503-no-key and 503-rate-limited read alike.
# Reddens: create-menu-ai: "the 503 is shown with the provider's own words"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = '    onError: (e) => { setPlan(null); setResults(null); setError(describe(e)) },\n'
b = "    onError: () => { setPlan(null); setResults(null); setError('Something went wrong') },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("quick-create-modal.tsx: The provider's own words are replaced by a house sentence, so 503-no-key and 503-rate-limited read alike.")
