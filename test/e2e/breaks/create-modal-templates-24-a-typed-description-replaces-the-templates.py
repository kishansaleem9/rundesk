# A TYPED DESCRIPTION REPLACES THE TEMPLATE'S
# (`found-30-sep/template-submit-ignores-the-form`): the words typed reach the
# task and the template's own description is lost, where ClickUp appends a
# template's description to the end of the task's.
#
# Reddens: create-modal-templates: "and its description is the one typed, then the template’s after it"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  const description = !typed ? payload.description ?? undefined : own ? `${typed}\\n\\n${own}` : typed\n"
b = "  const description = typed || (payload.description ?? undefined)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-24-a-typed-description-replaces-the-templates: the typed description replaces the template’s')
