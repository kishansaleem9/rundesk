# `scope: 'list'` is accepted and thrown away, so a field asked for on one list
# lands on every task in the project. A value the API takes and no writer
# honours — the mirror of a facade.
# Reddens: task-field-create — "the definition is stamped with this task's list",
#          "it shows on this list's task and NOT on the sibling list's",
#          "submitting the form writes the field the form described — type and scope included"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/custom-fields.service.ts'
a = "      listId: scope === 'list' ? task.listId : undefined,"
b = "      listId: undefined,"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("custom-fields.service.ts: the task-scoped create now discards `scope`, so every field is project-wide.")
