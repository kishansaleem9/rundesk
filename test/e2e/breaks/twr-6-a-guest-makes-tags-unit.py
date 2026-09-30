# A GUEST'S NAMED TAGS ARE MADE, where the tags route refuses a guest a tag.
#
# Reddens: unit: task-values.test.ts "finds a tag the workspace holds whatever its case, and would make the rest — none for a guest"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    else if (mayMake) toMake.push(l)\n',
     '    else toMake.push(l)\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-6-a-guest-makes-tags-unit: a guest would make tags')
