# A DUPLICATE CARRIES NONE OF THE ORIGINAL'S TAGS.
#
# Reddens: unit: task-templates.service.test.ts "duplicates a task with its own tags by id, and hands createTask no tag to make"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const labelIds = tagged.map((t) => t.labelId)\n',
     '    const labelIds: string[] = []\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-13-a-duplicate-drops-its-tags-unit: a duplicate has no tags')
