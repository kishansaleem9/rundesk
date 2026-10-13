# ANY FILE IS WORDS: a kind of file Brain cannot read is decoded as text and passed on.
# Reddens: unit: apps/api/src/modules/ai/artifacts-parse.test.ts "refuses a kind of file Brain cannot read, by its name"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/composer-files.ts'
s = io.open(p, encoding='utf-8').read()
a = "  throw refuse(`Brain reads images, PDFs, sheets, Word documents and text files — not “${name}”`)\n"
b = "  return { kind: 'text', name, text: capped(decodeText(bytes)) }\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('bcd-u2-any-file-is-words: a file of any kind is read as text')
