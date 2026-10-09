# FIVE PICTURES ARE ASKED OF THE SERVICE, past the four a comment takes.
# (`ledger-rows/row-870`)
# Reddens: ai-image-generation: "a guest is refused as on every AI route, and five pictures, a blank description and a size the service does not draw are refused 400"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    if (!Number.isInteger(count) || count < 1 || count > IMAGES_PER_ASK) {\n',
     '    if (!Number.isInteger(count) || count < 1 || count > 10) {\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('aig-5-five-pictures-go: five pictures go')
