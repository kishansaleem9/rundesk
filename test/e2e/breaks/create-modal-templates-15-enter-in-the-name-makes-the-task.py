# ENTER IN THE TEMPLATE-NAME BOX ALSO SUBMITS THE TASK'S FORM.
#
# The name box sits inside the task's own form, so an Enter it does not keep
# submits that form: saving a template makes the task too, and closes the
# modal on the person who only meant to name it.
#
# Reddens: create-modal-templates: "and Enter in the name box makes no task, leaves the form as it was, and the new template is under Use Template at once"
import io
p = '/home/user/rundesk/apps/web/src/components/quick-create-modal.tsx'
a = "                // Enter writes the template. It must not also submit the form,\n                // which would make the task.\n                e.preventDefault()\n"
b = "                // Enter writes the template. It must not also submit the form,\n                // which would make the task.\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-15-enter-in-the-name-makes-the-task: the Enter reaches the form')
