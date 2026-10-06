# A LIST IN THE TRASH IS NOT A NO TO A CALLER CHOOSING AMONG LISTS: the refusal is thrown at it.
# Reddens: unit: task-create.test.ts "answers no for a list in the trash, as a yes-or-no"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/task-create.ts'
a = '    if (err instanceof HttpException) return false\n'
b = '    if (err instanceof HttpException && !(err instanceof ListInTrashException)) return false\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tcg-4-the-trash-is-not-a-no-unit: the trash refusal is thrown, not answered')
