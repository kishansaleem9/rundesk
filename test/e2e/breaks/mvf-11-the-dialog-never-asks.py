# THE MERGE DIALOG NEVER ASKS (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`).
#
# Picking a task that lacks one of this task's fields with a value, the dialog
# asks first, as ClickUp's prompt does. Let it merge at once, as it did, and
# the field is neither offered nor added.
#
# Reddens: task-merge:
#   "picking a task that lacks one of this task’s fields with a value asks first: the dialog lists the field and its value, and offers “Add selected” and “Do nothing”, nothing merged yet"
#   "and “Add selected” merges with the field added: the survivor shows the value"
import io
p = '/home/user/rundesk/apps/web/src/components/task-merge-dialog.tsx'
a = "    if (lacking.length === 0) return merge.mutate({ targetTaskId: c.id })\n"
b = "    if (lacking.length >= 0) return merge.mutate({ targetTaskId: c.id })\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-11-the-dialog-never-asks: the merge dialog never asks')
