# A SURVIVOR'S EMPTIED VALUE IS KEPT AS ITS ANSWER, as it was (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`): the merged task's
# value stays in the bin beside a survivor's cleared Note. And the merge then writes to neither task's value row, so no check of a
# value typed while the merge runs finds the merge's write queued behind the held row.
# Reddens: task-merge: "a merged task’s value goes onto a survivor whose own value of the field was emptied — cleared, an empty text, every label taken off — and the merge counts it moved: the survivor holds it and the binned task none (read by SQL)"
#   and "a value typed into a survivor’s emptied field while the merge runs, queued ahead of the merge’s own write to it, stays: the merge leaves that field to it and counts none moved, and the merged task’s value stays on the binned task (read by SQL)"
#   and "and one queued just behind the merge’s write lands on the survivor’s row, which is still there: the merge counts the merged value moved, the typed one is written over it, and the binned task holds none (read by SQL)"
#   and "and one typed into the merged task’s own field, queued behind the merge’s delete of that task’s row, is written all the same: the survivor holds the merged value, and the binned task the typed one (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const givesWay = !holdsNoInformation(merged.value) && holdsNoInformation(survivors.value)\n"
b = "    const givesWay = merged.value === null // BROKEN: any value of the survivor's is kept, emptied or not\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-1-an-emptied-value-is-information: a survivor's emptied value is kept")
