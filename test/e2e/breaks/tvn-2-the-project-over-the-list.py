# OF TWO FIELDS OF ONE NAME, THE PROJECT'S IS TAKEN OVER THE TASK'S OWN LIST'S (`found-30-sep/template-values-find-fields-by-name-alone`).
# Reddens: create-modal-templates: "and applied in the side list, whose tasks have both Stage fields, the value goes into the side list’s own, and the Scope field, the task’s here, is written"
import io
p = '/home/user/rundesk/apps/api/src/modules/task-templates/task-templates.service.ts'
a = "    const own = named.filter((f) => f.listId === listId)\n"
b = "    const own = named.filter((f) => f.listId == null) // BROKEN: the project's over the list's\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tvn-2-the-project-over-the-list: the project’s field is taken over the list’s own")
