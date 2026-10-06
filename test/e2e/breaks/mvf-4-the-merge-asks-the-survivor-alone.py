# THE MERGE ASKS ONLY WHETHER THE SURVIVOR HAS A FIELD, NOT WHETHER THE MERGED TASK STILL DOES (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`, its review):
# a value a task kept when it moved out of the field’s list goes onto a survivor in that list, where it shows.
# Reddens: task-merge: "and a task moved out of a field’s list, which no longer shows its value there, merged into a task of that list keeps the value on the binned task — the survivor, which has the field, holds none and shows it empty (read by SQL), and the merge counts no field moved"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const mergedShows = (field: HeldField) => !!there && fieldIsOnTask(field, { projectId: there.projectId, listId: from.listId })\n'
b = "    const mergedShows = (field: HeldField) => !!field // BROKEN: the merged task's own fields are not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-4-the-merge-asks-the-survivor-alone: a merge moves a value the merged task no longer shows')
