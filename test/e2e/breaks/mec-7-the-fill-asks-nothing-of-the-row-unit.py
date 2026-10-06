# THE SURVIVOR'S EMPTIED ROW IS FILLED WHATEVER IT HOLDS BY THEN, as `mec-6`, for the unit tests of `moveFieldValues`
# (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the review).
# Reddens: unit: tasks-merge-fields.test.ts "fills the survivor’s emptied row only while it holds what was read: a value written there since stays, and the merged task’s with it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        .where(and(eq(v.id, survivors.id), eq(v.value, survivors.value)))\n"
b = "        .where(eq(v.id, survivors.id)) // BROKEN: filled whatever the row holds by then\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-7-the-fill-asks-nothing-of-the-row-unit: the survivor's row is filled whatever it holds")
