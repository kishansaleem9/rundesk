# THE TEMPLATE'S ROUTE TAKES ITS BODY UNREAD AGAIN
# (`found-30-sep/template-submit-ignores-the-form`): the body is an untyped shape,
# which the global ValidationPipe does not validate, so what `POST /tasks`
# refuses — a date that is not ISO — is taken here and a task is made with it.
#
# Reddens: create-modal-templates: "and the template’s route refuses each value POST /tasks refuses — a priority not of the four, a date that is not ISO, an estimate in parts of a second, a task type, a label and a person that are not this workspace’s — with the same answer, and makes no task"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.controller.ts'
a = "    @Body() body: InstantiateTemplateDto,\n"
b = "    @Body() body: { listId: string } & Record<string, any>,\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('create-modal-templates-26-the-route-takes-its-body-unread: instantiate’s body is not validated')
