# PAST TWENTY TAGS, THE FIRST TWENTY ARE KEPT, asked of the normaliser itself (`ledger-rows/row-1874`).
# Reddens: unit: project-templates.service.test.ts "refuses more than twenty tags, saying how many, rather than keeping the first twenty"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    throw new BadRequestException(`A template can carry at most ${TEMPLATE_TAGS_MAX} tags, and these are ${out.length}`)\n"
b = "    return out.slice(0, TEMPLATE_TAGS_MAX) // BROKEN: the first twenty kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-6-first-twenty-kept-unit: twenty-one tags are cut to twenty')
