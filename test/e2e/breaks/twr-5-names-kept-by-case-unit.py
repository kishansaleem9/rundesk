# TAG NAMES ARE KEPT ONCE BY THEIR CASE: "Design" and "design" are two.
#
# Reddens: unit: task-values.test.ts "trims each name, drops a blank, keeps each once whatever its case, and gives one without a colour the neutral one"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-values.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const key = name.toLowerCase()\n',
     '    const key = name\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-5-names-kept-by-case-unit: names differing only in case are both kept')
