# A file of any kind is passed on as text.
# Reddens: brain-comments-and-decks: "a file Brain cannot read is refused by its name"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/composer-files.ts'
a = '  throw refuse(`Brain reads images, PDFs, sheets, Word documents and text files — not “${name}”`)\n'
b = "  return { kind: 'text', name, text: capped(decodeText(bytes)) }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-12-any-file-taken: A file of any kind is passed on as text.')
