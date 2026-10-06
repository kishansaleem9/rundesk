# THE MERGE ASKS ONLY THAT A FIELD IS OF THE SURVIVOR'S PROJECT (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`): a value of a
# field scoped to another list of it moves onto the survivor, whose fields do not show it.
# Re-aimed 5 October: the merge asks the merged task's own fields too (the item's review), so the line moved; the patch still asks the survivor's project alone.
# Reddens: task-merge: "a task of another list merged in keeps on the binned task its value for a field scoped to its own list, which the survivor does not have, and that task still shows it — none is written onto the survivor (read by SQL) — while its value for a field of the project moves"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const survivorHas = (field: HeldField) => !!home && fieldIsOnTask(field, { projectId: home.projectId, listId: to.listId })\n"
b = "    const survivorHas = (field: HeldField) => !!home && field.projectId === home.projectId // BROKEN: the list is not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mvf-1-the-merge-asks-the-project-alone: a merge moves a value of a field scoped to another list")
