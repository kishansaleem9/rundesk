# A TEMPLATE'S TAGS ARE WRITTEN AS TYPED, SPACES AND BLANKS INCLUDED (`ledger-rows/row-1874`).
# Reddens: unit: project-templates.service.test.ts "trims each tag, makes a run of spaces one, and drops the blanks"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    const tag = raw.trim().replace(/\\s+/g, ' ')\n"
b = "    const tag = raw // BROKEN: not trimmed\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-1-tags-kept-untrimmed-unit: tags are kept as typed')
