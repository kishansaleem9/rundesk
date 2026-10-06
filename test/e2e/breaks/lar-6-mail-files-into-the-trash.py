# MAIL TO A DELETED LIST’S ADDRESS MAKES A TASK IN IT, as it did: past `createTask` and its gate, where nobody can
# find it.
# Reddens: list-address-readers: "mail to the address of a list in the trash makes no task in it — the message is recorded as refused, saying the list is in the trash"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
a = '    if ((await listTrashState(this.db, alias.listId))?.inTrash) {\n'
b = "    if ((await listTrashState(this.db, alias.listId))?.inTrash && alias.listId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lar-6-mail-files-into-the-trash: mail files into the trash')
