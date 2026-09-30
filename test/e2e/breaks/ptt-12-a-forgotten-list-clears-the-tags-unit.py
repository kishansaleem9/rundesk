# A TAGS EDIT WITH NO LIST IN ITS BODY CLEARS THE TAGS (`ledger-rows/row-1874`).
# `{}` is read as "no tags" and written: a client that forgot the field wipes them.
# Reddens: unit: project-templates.service.test.ts "refuses a body with no list rather than clearing the tags, and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (value === undefined) throw new BadRequestException('Send the tags as a list; an empty list clears them')\n"
b = "    // BROKEN: an absent list clears them\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-12-a-forgotten-list-clears-the-tags-unit: a body with no list clears the tags')
