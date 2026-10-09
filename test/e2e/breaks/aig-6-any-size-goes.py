# ANY SIZE IS ASKED OF THE SERVICE.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "a guest is refused as on every AI route, and five pictures, a blank description and a size the service does not draw are refused 400"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!(IMAGE_SIZES as readonly unknown[]).includes(size)) {\n',
     '    if (!(IMAGE_SIZES as readonly unknown[]).includes(size) && size.length < 0) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-6-any-size-goes: any size goes')
