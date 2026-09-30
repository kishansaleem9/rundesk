# A TEMPLATE'S LAST TAG CAN NEVER BE TAKEN OFF (`ledger-rows/row-1874`).
# An empty list is refused like an absent one, so a template once tagged stays tagged.
# Reddens: unit: project-templates.service.test.ts "clears them when sent an empty list"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    if (value === undefined) throw new BadRequestException('Send the tags as a list; an empty list clears them')\n"
b = ("    if (value === undefined || (Array.isArray(value) && value.length === 0)) // BROKEN: an empty list refused\n"
     "      throw new BadRequestException('Send the tags as a list; an empty list clears them')\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-10-tags-cannot-be-cleared-unit: an empty list is refused')
