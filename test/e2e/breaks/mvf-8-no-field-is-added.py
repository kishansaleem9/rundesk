# A MERGE ASKED TO ADD A FIELD THE SURVIVOR LACKS ADDS NONE (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# Let a copy never be made, as nothing made one, and "Add selected" leaves the
# value on the binned task: the survivor shows no Stage, no Owner, and holds
# none to keep, from the route or from the dialog.
#
# Reddens: task-merge:
#   "a merge asked to add a field kept to another list adds it to the survivor’s list and moves the value there: the survivor shows it, a field of that name is now kept to its list, and the binned task holds it no more (read by SQL)"
#   "and from another project: its field is added to the survivor’s project, kept to its list, with the value — and a second merge asked to add it finds that field there and makes no other"
#   "and the survivor’s own value is kept where it holds one, the merged value staying on the binned task; a field the survivor has is refused in one sentence, and nothing is merged"
#   "and “Add selected” merges with the field added: the survivor shows the value"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        let fieldId = reuse\n        if (!fieldId) {\n"
b = "        let fieldId = reuse\n        if (!fieldId) return 0\n        if (!fieldId) {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-8-no-field-is-added: no copy of a field is made')
