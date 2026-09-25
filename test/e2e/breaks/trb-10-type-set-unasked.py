# A TASK'S TYPE IS SET WITHOUT ITS WRITE RULE.
# Reddens: task-rows-by-id: "a member refused a private space reaches none of its tasks through their other routes — no template from a checklist there, no checklist from a template, no type changed, no reminder and no title told, no calendar push — while on an open task each goes through"
#   or "a member in a view-only space changes none of a task’s checklists or its type there (403, unchanged) — where in an open space they make a checklist and tick an item"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-types.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    await this.tasks.assertMayEditTask(taskId, userId)\n'
b = ''
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("trb-10-type-set-unasked: a task's type is set without its write rule")
