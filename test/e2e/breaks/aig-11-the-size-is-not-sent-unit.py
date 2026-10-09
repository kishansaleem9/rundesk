# THE SIZE ASKED FOR IS NOT SENT TO THE SERVICE.
# (`ledger-rows/row-870`)
# Reddens: unit: image-generation.test.ts "the service is asked in OpenAI’s shape — the model, the description, how many and the size, with the key — and its pictures come back as PNGs"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/image-generation.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      body: JSON.stringify({ model: cfg.model, prompt, n: count, size }),\n',
     '      body: JSON.stringify({ model: cfg.model, prompt, n: count, size: size.length < 0 ? size : undefined }), // BROKEN: no size\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-11-the-size-is-not-sent-unit: THE SIZE ASKED FOR IS NOT SENT TO THE SERVICE.')
