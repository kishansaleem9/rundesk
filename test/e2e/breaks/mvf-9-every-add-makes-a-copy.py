# EVERY FIELD A MERGE ADDS IS A NEW COPY (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# A field of the same name and type on the survivor takes the value. Let it
# never be found, and each merge asked to add Owner makes another Owner on the
# survivor's list, the third merge's value going into an empty one beside the
# Owner the survivor holds.
#
# Reddens: task-merge:
#   "and from another project: its field is added to the survivor’s project, kept to its list, with the value — and a second merge asked to add it finds that field there and makes no other"
#   "and the survivor’s own value is kept where it holds one, the merged value staying on the binned task; a field the survivor has is refused in one sentence, and nothing is merged"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      const reuse = own.find((g) => g.type === field.type && sameName(g.name, field.name))?.id ?? null\n"
b = "      const reuse = own.find((g) => g.type === field.type && sameName(g.name, field.name) && false)?.id ?? null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-9-every-add-makes-a-copy: a same-named field is never taken')
