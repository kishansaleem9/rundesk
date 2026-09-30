# TAGS SENT AS ONE STRING ARE READ AS NO TAGS (`ledger-rows/row-1874`).
# `tags: "Q3"` answers 201 and the template carries nothing: the mistake is swallowed.
# Reddens: unit: project-templates.service.test.ts "refuses a list that is not one, and a tag that is not text"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "  if (!Array.isArray(value)) throw new BadRequestException('Tags must be a list of words')\n"
b = "  if (!Array.isArray(value)) return [] // BROKEN: a non-list is no tags\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-8-a-non-list-is-no-tags-unit: a string of tags is read as none')
