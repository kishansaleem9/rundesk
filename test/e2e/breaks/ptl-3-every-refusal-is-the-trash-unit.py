# EVERY REFUSAL OF THE CHOSEN LIST IS SAID TO BE THE TRASH: one the person may no longer open included.
# Reddens: unit: planner-default-list-trash.test.ts "nor for one the person may no longer open, which /task passes over too"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '      if (err instanceof HttpException) return false\n'
b = '      if (err instanceof HttpException) return true\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ptl-3-every-refusal-is-the-trash-unit: every refusal is said to be the trash')
