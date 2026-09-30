# THE TEMPLATE ROUTE'S BODY TAKES ANY TEXT AS A DUE DATE
# (`found-30-sep/template-submit-ignores-the-form`): `POST /tasks` refuses a due
# date that is not ISO, and this body no longer does.
# Reddens: unit: task-templates.service.test.ts "takes a body holding every field the form can set, and refuses each value POST /tasks refuses, by the same field"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/dto/instantiate-template.dto.ts'
a = "  @IsDateString()\n  dueDate?: string\n"
b = "  dueDate?: string\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tsf-4-the-body-takes-any-due-date-unit: the due date is not checked')
