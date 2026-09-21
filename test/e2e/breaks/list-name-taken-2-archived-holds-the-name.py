# An archived list keeps its name reserved. Somebody bins a list and cannot
# make another with the same name, and nothing on screen explains why — the
# thing holding the name is in the bin and invisible.
#
# Reddens: list-name-taken: "and an archived list does not hold its name hostage"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.service.ts'
a = '          eq(lists.isArchived, false),\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lists.service.ts: an archived list keeps its name reserved.')
