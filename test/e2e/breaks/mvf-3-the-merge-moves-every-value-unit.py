# THE MERGE MOVES EVERY VALUE, as it did (`found-30-sep/merge-moves-values-onto-fields-the-target-lacks`), for the unit tests of
# `moveFieldValues`.
# Re-aimed 5 October: the anchor moved with the review's change (the merged task's own fields are asked too). Measured then: 3 of the
# file's 4 tests fail — the one named, “leaves on the merged task its own project’s field’s value when the survivor is in another
# project” and “leaves on the merged task a value it no longer shows, though the survivor has the field: it moved out of the field’s list”.
# Reddens: unit: tasks-merge-fields.test.ts "moves a value of the survivor’s project’s field, and leaves on the merged task one of a field scoped to another list and one of another project"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      (r) => movable.has(r.fieldId),\n"
b = "      () => true, // BROKEN: every value moves\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mvf-3-the-merge-moves-every-value-unit: a merge moves every value of the merged task")
