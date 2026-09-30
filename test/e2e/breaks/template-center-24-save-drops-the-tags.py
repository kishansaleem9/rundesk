# SAVING A PROJECT AS A TEMPLATE DROPS ITS TAGS (`ledger-rows/row-1874`).
#
# The dialog sends them, the server cleans them, and the insert leaves them
# out: the template is saved, the toast says so, and it carries none.
#
# Reddens: template-center: "a template saved from the page with Q3, \"  Launch   day \" and q3 carries Q3 and Launch day (read from the database)"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = ("        complexity: complexityOf(payload),\n"
     "        category: isCategory(dto.category) ? dto.category : null,\n"
     "        useCase: isUseCase(dto.useCase) ? dto.useCase : null,\n"
     "        tags,\n")
b = ("        complexity: complexityOf(payload),\n"
     "        category: isCategory(dto.category) ? dto.category : null,\n"
     "        useCase: isUseCase(dto.useCase) ? dto.useCase : null,\n"
     "        // BROKEN: the tags are not written\n")
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('template-center-24-save-drops-the-tags: a project saved as a template keeps none of its tags')
