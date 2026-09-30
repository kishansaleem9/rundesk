# THE TAGS SET IN THE FORM REPLACE THE TEMPLATE'S
# (`found-30-sep/template-submit-ignores-the-form`): a typed tag reaches the task,
# and the template's own tag is dropped for it, where ClickUp's merge adds.
#
# Reddens: create-modal-templates: "and the member assigned and the tag added in the form are on it, beside the template’s own tag (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  const labelIds = [...new Set([...templateLabelIds, ...(form.labelIds ?? [])])]\n"
b = "  const labelIds = form.labelIds?.length ? [...new Set(form.labelIds)] : templateLabelIds\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-23-the-form-tags-replace-the-templates: typed tags replace the template’s')
