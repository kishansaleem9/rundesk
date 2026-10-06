# MAIL FILES INTO A LIST WHOSE PROJECT IS IN THE TRASH. (`found-6-oct/task-fallback-files-into-a-deleted-project`)
# Reddens: unit: email-to-task.service.test.ts "makes no task from mail to the address of a list whose project is in the trash, and records why (found-6-oct/task-fallback-files-into-a-deleted-project)"
import io
p = '/home/user/rundesk/apps/api/src/modules/email-to-task/email-to-task.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '    const held = await heldInTrash(this.db, alias.listId)\n    if (held) {\n'
b = "    const held = await heldInTrash(this.db, alias.listId)\n    if (held && payload.messageId === '') {\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('ett-4-mail-files-into-a-held-list-unit: mail asks nothing of what holds the list')
