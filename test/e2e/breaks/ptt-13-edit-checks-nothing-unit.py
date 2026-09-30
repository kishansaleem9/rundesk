# A TAGS EDIT SKIPS THE BOUNDS THE SAVE KEEPS (`ledger-rows/row-1874`).
# Any list is written as sent: forty-one characters, a hundred tags.
# Reddens: unit: project-templates.service.test.ts "refuses tags past their bounds and writes nothing"
import io
p = '/home/user/rundesk/apps/api/src/modules/project-templates/project-templates.service.ts'
a = "    const tags = normalizeTemplateTags(value)\n"
b = "    const tags = (Array.isArray(value) ? value : []) as string[] // BROKEN: nothing checked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptt-13-edit-checks-nothing-unit: an edit writes any list')
