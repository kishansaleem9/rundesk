# A TAG NAMED FOR A TASK IS MADE AS SOON AS IT IS READ, before the type is asked and outside
# the transaction, so a create refused after it leaves the tag.
#
# Reddens: unit: task-writes.test.ts "makes a tag named for the task only after the task, in its transaction — and a create refused after the names are read makes none"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('        labelsToMake = plan.toMake\n',
     '        labelsToMake = plan.toMake\n        if (labelsToMake.length) await this.db.insert(labels).values(labelsToMake.map((l) => ({ workspaceId: home.workspaceId, name: l.name, color: l.color! }))).onConflictDoNothing()\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-8-tags-made-before-the-create-is-asked-unit: tags by name are made before the create is asked')
