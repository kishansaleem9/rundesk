# A TASK IS MOVED INTO A LIST IN THE TRASH, as it was: singly (201) and in bulk (200, nothing failed), out of
# every list of lists, for the purge to take.
# Reddens: task-creation-access: "and a task is not moved into a list in the trash — 409 to the member in those words, a bulk move by the admin failing in its own — and stays where it was (SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    if (target.listInTrash) {\n'
b = "    if (target.listInTrash && actorId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcm-9-a-task-moves-into-the-trash: a task moves into the trash')
