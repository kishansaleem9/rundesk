# A CHOSEN LIST IN THE TRASH IS PASSED OVER, NOT REFUSED: the task goes to the oldest list instead.
# Reddens: unit: default-list.test.ts "refuses, saying the chosen Default list is in the trash, rather than filing the task there or elsewhere"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          if (err instanceof ListInTrashException) {\n'
b = "          if (err instanceof ListInTrashException && actorId === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dlf-1-a-deleted-choice-is-passed-over-unit: a chosen list in the trash is passed over')
