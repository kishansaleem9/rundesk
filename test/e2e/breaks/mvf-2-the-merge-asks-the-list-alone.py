# THE MERGE ASKS ONLY A FIELD'S LIST (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`): a project-wide field of another project
# reads as the survivor's, and its value moves onto the survivor, whose fields do not show it.
# Re-aimed 5 October: the merge asks the merged task's own fields too (the item's review), so the line moved; the patch still asks the survivor's list alone.
# Reddens: task-merge: "and a task of another project merged in keeps its project’s field’s value on the binned task, which still shows it — the survivor holds none (read by SQL), and the merge counts no field moved"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const survivorHas = (field: HeldField) => !!home && fieldIsOnTask(field, { projectId: home.projectId, listId: to.listId })\n"
b = "    const survivorHas = (field: HeldField) => !!home && (field.listId == null || field.listId === to.listId) // BROKEN: the project is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mvf-2-the-merge-asks-the-list-alone: a merge moves a value of another project's field")
