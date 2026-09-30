# THE PRIORITY SET BESIDE A TEMPLATE IS IGNORED, AS IT WAS
# (`found-30-sep/template-submit-ignores-the-form`): the task takes the template's
# priority whatever the form says.
# Reddens: unit: task-templates.service.test.ts "lets the priority, task type, start and due dates and estimate set in the form win over the template’s, leaves each one not set to the template, and still makes its checklist and subtask"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    priority: form.priority ?? payload.priority,\n"
b = "    priority: payload.priority,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-1-the-priority-set-is-ignored-unit: the template’s priority whatever was set')
