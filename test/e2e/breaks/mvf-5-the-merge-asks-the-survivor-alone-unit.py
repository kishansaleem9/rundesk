# THE MERGE ASKS ONLY WHETHER THE SURVIVOR HAS A FIELD, as `mvf-4`, for the unit tests of `moveFieldValues` (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`, its review).
# Reddens: unit: tasks-merge-fields.test.ts "leaves on the merged task a value it no longer shows, though the survivor has the field: it moved out of the field’s list"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    const mergedShows = (field: HeldField) => !!there && fieldIsOnTask(field, { projectId: there.projectId, listId: from.listId })\n'
b = "    const mergedShows = (field: HeldField) => !!field // BROKEN: the merged task's own fields are not asked\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('mvf-5-the-merge-asks-the-survivor-alone-unit: a merge moves a value the merged task no longer shows')
