# PAST TWENTY TAGS, THE FIRST TWENTY ARE KEPT IN SILENCE (`ledger-rows/row-1874`).
#
# `normalizeMeetingTags`' behaviour, on a template: the write answers 200 and
# the twenty-first tag is gone without a word, a tag its saver believes the
# template carries.
#
# Reddens: template-center: "twenty-one tags are refused in words — 400, \"A template can carry at most 20 tags…\" — and nothing is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    throw new BadRequestException(`A template can carry at most ${TEMPLATE_TAGS_MAX} tags, and these are ${out.length}`)\n"
b = "    return out.slice(0, TEMPLATE_TAGS_MAX) // BROKEN: the first twenty kept\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-31-first-twenty-kept: twenty-one tags are cut to twenty')
