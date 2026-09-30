# A TEMPLATE'S TAGS ARE MADE BEFORE `createTask` IS ASKED, so a refused create leaves them.
#
# Reddens: unit: task-templates.service.test.ts "writes nothing at all when createTask refuses the task: no tag, no checklist, no count"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('    const payload = template.payload\n    const now = new Date()\n',
     "    const payload = template.payload\n    const now = new Date()\n    if (payload.labels?.length) {\n      await this.db.insert(labels).values(payload.labels.map((name) => ({ workspaceId, name, color: '#94a3b8' }))).onConflictDoNothing()\n    }\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('twr-12-the-template-makes-its-tags-first-unit: the template makes its tags first')
