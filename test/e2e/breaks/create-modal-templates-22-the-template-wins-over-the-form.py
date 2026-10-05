# THE TEMPLATE'S ONE VALUES WIN OVER WHAT WAS SET IN THE FORM
# (`found-30-sep/template-submit-ignores-the-form`): the priority and the due date
# are sent and read, and the template's own are written over them whenever it
# has one — the typed High becomes the template's Low.
#
# Reddens: create-modal-templates: "Create task with the template chosen makes the task with the priority High and the due date set in the form, over the template’s Low and its own due date, and with the template’s checklist and subtask (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    priority: form.priority ?? payload.priority,\n",
     "    priority: payload.priority ?? form.priority,\n"),
    ("    dueDate: form.dueDate ? new Date(form.dueDate) : offsetToDate(now, payload.dueDateOffsetDays) ?? undefined,\n",
     "    dueDate: offsetToDate(now, payload.dueDateOffsetDays) ?? (form.dueDate ? new Date(form.dueDate) : undefined),\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('create-modal-templates-22-the-template-wins-over-the-form: the template’s priority and due date win')
