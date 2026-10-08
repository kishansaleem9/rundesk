# A TAG GIVEN IN TWO CASES IS KEPT TWICE, asked of the normaliser itself (`ledger-rows/row-1874`).
# Re-claimed 8 October (batch 18): a tag is kept in lower case now (`found-30-sep/template-tags-keep-their-case`), and the test is named so.
# Reddens: unit: project-templates.service.test.ts "keeps one tag per word whatever its case, in lower case as ClickUp keeps a tag"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (seen.has(key)) continue\n"
b = "    // BROKEN: duplicates kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-2-duplicates-kept-unit: a tag given in two cases is kept twice')
