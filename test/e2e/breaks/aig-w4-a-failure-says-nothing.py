# A SERVICE THAT FAILED IS SAID AS NOTHING.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "and the composer says the service did not answer, in its words, and draws no picture"
import io
p = '/home/user/rundesk/apps/web/src/components/image-generator.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    onError: (err) => setError(err instanceof ApiError ? err.message : t('imageGen.failed')),\n",
     "    onError: (err) => setError(err instanceof ApiError ? '' : t('imageGen.failed')), // BROKEN: says nothing\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-w4-a-failure-says-nothing: a failure says nothing')
