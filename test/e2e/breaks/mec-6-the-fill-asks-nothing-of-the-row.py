# THE SURVIVOR'S EMPTIED ROW IS FILLED WHATEVER IT HOLDS BY THEN (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the review):
# the fill asks the row's id alone, so a value typed into the survivor's field after the merge read it empty is written over.
# Reddens: task-merge: "a value typed into a survivor’s emptied field while the merge runs, queued ahead of the merge’s own write to it, stays: the merge leaves that field to it and counts none moved, and the merged task’s value stays on the binned task (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "        .where(and(eq(v.id, survivors.id), eq(v.value, survivors.value)))\n"
b = "        .where(eq(v.id, survivors.id)) // BROKEN: filled whatever the row holds by then\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-6-the-fill-asks-nothing-of-the-row: the survivor's row is filled whatever it holds")
