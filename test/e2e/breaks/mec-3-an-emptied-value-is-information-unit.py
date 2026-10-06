# A SURVIVOR'S EMPTIED VALUE IS KEPT AS ITS ANSWER, as `mec-1`, for the unit tests of `moveFieldValues` (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`).
# Reddens: unit: tasks-merge-fields.test.ts "moves the merged task’s value onto the survivor in place of its emptied one: cleared, an empty text, an empty list"
#   and "never deletes the survivor’s row: it takes the merged value where it is, and the merged task’s row then goes as it was read, the two in one transaction"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const givesWay = !holdsNoInformation(merged.value) && holdsNoInformation(survivors.value)\n"
b = "    const givesWay = merged.value === null // BROKEN: any value of the survivor's is kept, emptied or not\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-3-an-emptied-value-is-information-unit: a survivor's emptied value is kept")
