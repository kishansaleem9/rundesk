# A TEMPLATE SAVED WITH NO TAGS AT ALL IS REFUSED (`ledger-rows/row-1874`).
# Every save that sent no list — every caller written before tags existed — would answer 400.
# Reddens: unit: project-templates.service.test.ts "reads an absent list as no tags"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "  if (value === undefined || value === null) return []\n"
b = "  if (value === null) return [] // BROKEN: an absent list is refused\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-3-absent-tags-refused-unit: a save with no tags is refused')
