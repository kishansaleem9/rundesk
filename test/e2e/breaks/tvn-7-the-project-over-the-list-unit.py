# OF TWO FIELDS OF ONE NAME, THE PROJECT'S IS TAKEN, as `tvn-2`, for the unit test (`found-30-sep/template-values-find-fields-by-name-alone`).
# Reddens: unit: task-templates.service.test.ts "between two fields of one name the task has, writes into the one scoped to its own list, and into neither when both are the project’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    const own = named.filter((f) => f.listId === listId)\n"
b = "    const own = named.filter((f) => f.listId == null) // BROKEN: the project's over the list's\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-7-the-project-over-the-list-unit: the project’s field is taken over the list’s own")
