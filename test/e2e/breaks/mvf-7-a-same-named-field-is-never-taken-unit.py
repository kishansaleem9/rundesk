# A MERGE NEVER TAKES THE SURVIVOR'S FIELD OF THE SAME NAME, READ FROM ITS UNIT TEST (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# Reddens: unit: tasks-merge-fields.test.ts "takes a field of the same name and type the survivor has, whatever its case, and asks no rule for making one"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      const reuse = own.find((g) => g.type === field.type && sameName(g.name, field.name))?.id ?? null\n"
b = "      const reuse = own.find((g) => g.type === field.type && sameName(g.name, field.name) && false)?.id ?? null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-7-a-same-named-field-is-never-taken-unit: a merge never takes a field of the same name')
