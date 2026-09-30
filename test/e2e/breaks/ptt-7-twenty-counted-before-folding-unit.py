# THE TWENTY ARE COUNTED BEFORE THE DUPLICATES ARE FOLDED (`ledger-rows/row-1874`).
# Twenty tags each sent twice in two cases are twenty tags, and are refused as forty.
# Reddens: unit: project-templates.service.test.ts "counts the twenty after the duplicates are folded, so a list that only repeats itself is not refused"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "  if (out.length > TEMPLATE_TAGS_MAX) {\n"
b = "  if (value.length > TEMPLATE_TAGS_MAX) { // BROKEN: counted as sent\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-7-twenty-counted-before-folding-unit: the bound counts the list as sent')
