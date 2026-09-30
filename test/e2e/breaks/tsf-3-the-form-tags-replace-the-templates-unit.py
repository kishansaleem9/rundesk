# THE TAGS SET IN THE FORM REPLACE THE TEMPLATE'S INSTEAD OF JOINING THEM
# (`found-30-sep/template-submit-ignores-the-form`).
# Reddens: unit: task-templates.service.test.ts "makes the tags the template’s and the form’s together, each once, and assigns each person set once"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  const labelIds = [...new Set([...templateLabelIds, ...(form.labelIds ?? [])])]\n"
b = "  const labelIds = form.labelIds?.length ? [...new Set(form.labelIds)] : templateLabelIds\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-3-the-form-tags-replace-the-templates-unit: typed tags replace the template’s')
