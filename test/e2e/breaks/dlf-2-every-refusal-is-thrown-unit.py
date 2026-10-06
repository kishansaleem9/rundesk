# EVERY REFUSAL OF THE CHOSEN LIST IS THROWN: a list the person may not add to refuses /task instead of being passed over.
# Reddens: unit: default-list.test.ts "still passes over a chosen list the person may not add to, for the oldest one they may"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '          if (!(err instanceof HttpException)) throw err\n'
b = '          throw err\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dlf-2-every-refusal-is-thrown-unit: every refusal of the chosen list is thrown')
