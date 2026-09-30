# A TYPED DESCRIPTION REPLACES THE TEMPLATE'S INSTEAD OF COMING BEFORE IT
# (`found-30-sep/template-submit-ignores-the-form`).
# Reddens: unit: task-templates.service.test.ts "puts a typed description first and the template’s after it, and either alone as it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "  const description = !typed ? payload.description ?? undefined : own ? `${typed}\\n\\n${own}` : typed\n"
b = "  const description = typed || (payload.description ?? undefined)\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-2-a-typed-description-replaces-the-templates-unit: the typed description replaces the template’s')
