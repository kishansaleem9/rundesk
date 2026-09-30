# A TAG GIVEN IN TWO CASES IS KEPT TWICE, asked of the normaliser itself (`ledger-rows/row-1874`).
# Reddens: unit: project-templates.service.test.ts "keeps one tag per word whatever its case, in the spelling first given"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (seen.has(key)) continue\n"
b = "    // BROKEN: duplicates kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-2-duplicates-kept-unit: a tag given in two cases is kept twice')
