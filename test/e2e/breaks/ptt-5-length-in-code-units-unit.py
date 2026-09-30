# A TAG'S LENGTH COUNTED IN UTF-16 UNITS (`ledger-rows/row-1874`).
# Twenty emoji read as forty characters, so a tag a person sees as short is refused as long.
# Reddens: unit: project-templates.service.test.ts "counts a tag's characters as a person does, so forty emoji are a tag and forty-one are not"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    const chars = Array.from(tag)\n"
b = "    const chars = tag.split('') // BROKEN: UTF-16 units\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-5-length-in-code-units-unit: an emoji counts as two characters')
