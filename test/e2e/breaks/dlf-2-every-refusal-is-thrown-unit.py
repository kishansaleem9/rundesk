# EVERY REFUSAL OF THE CHOSEN LIST IS THROWN: a list the person may not add to refuses /task instead of being passed over.
# Reddens: unit: default-list.test.ts "still passes over a chosen list the person may not add to — for a guest, who has no Personal List, the oldest one they may"
#
# Re-claimed 12 October: the test is a guest's now (a member is given their Personal List), and its name says so. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          if (!(err instanceof HttpException)) throw err\n'
b = '          throw err\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dlf-2-every-refusal-is-thrown-unit: every refusal of the chosen list is thrown')
