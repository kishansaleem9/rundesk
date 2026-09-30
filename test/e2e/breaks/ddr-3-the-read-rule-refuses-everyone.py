# The check refuses every caller, the way a guard that is too tight fails: a
# refusal check alone passes it, so the suite also asks that a task the member
# may open is duplicated and saved.
#
# Reddens: create-modal-templates: "while a task they may open, the same member duplicates and saves as a template"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = """    if (!(await readableTask(this.db, workspaceId, taskId, { id: actor.id, role: actor.role ?? null }))) {
      throw new NotFoundException('Task not found in this workspace')
    }
"""
b = """    if (!(await readableTask(this.db, workspaceId, taskId, { id: actor.id, role: actor.role ?? null })) || actor.role !== 'super_admin') {
      throw new NotFoundException('Task not found in this workspace')
    }
"""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-templates.service.ts: nobody but a super admin may copy a task.')
