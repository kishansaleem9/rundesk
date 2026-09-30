# A TEMPLATE'S MISSING TAGS ARE MADE BEFORE THE CREATE IS ASKED (`found-30-sep/refused-create-leaves-tags`):
# as before, so a create refused for its task type leaves the template's tag in the workspace.
#
# Reddens: create-modal-templates: "a task from a template refused for its task type (400) makes no task and adds none of the template’s tags to the workspace, while made, the same template brings its tag (read by SQL)"
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
print('create-modal-templates-28-the-template-makes-its-tags-first: the template makes its tags before createTask asks')
