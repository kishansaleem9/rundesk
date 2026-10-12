# THE PDF SAYS WHERE ITS OBJECTS START IN CHARACTERS, NOT BYTES.
# (`resume-defects/resume-5`)
# Reddens: unit: gantt-export.test.ts "says where each object starts, in bytes, and where the table is"
#
# The marker line after the header is four characters and eight bytes: every offset after it is four short, and a reader that trusts the table finds no object there.
# The file itself is whole — only the table of where things start is counted in characters.
import io
p = '/home/user/rundesk/apps/web/src/lib/gantt-export.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('  let length = 0\n',
     '  let length = 0\n  let chars = 0\n'),
    ("    length += bytes.length\n",
     "    length += bytes.length\n    chars += typeof part === 'string' ? part.length : bytes.length\n"),
    ('    offsets[n] = length\n',
     '    offsets[n] = chars\n'),
    ('  const xref = length\n',
     '  const xref = chars\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('goc-u1-offsets-counted-in-characters: THE PDF SAYS WHERE ITS OBJECTS START IN CHARACTERS, NOT BYTES.')
