# MAIL TO A DELETED LIST’S ADDRESS MAKES A TASK IN IT, as it did.
# Reddens: unit: email-to-task.service.test.ts "makes no task from mail to the address of a list in the trash: rejected, and recorded saying why"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = '    if ((await listTrashState(this.db, alias.listId))?.inTrash) {\n'
b = "    if ((await listTrashState(this.db, alias.listId))?.inTrash && alias.listId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ett-1-mail-files-into-the-trash-unit: mail files into the trash')
