# THE SURVIVOR'S OWN VALUE GIVES WAY WHATEVER IT HOLDS, as `mec-2`, for the unit tests of `moveFieldValues` (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`).
# Reddens: unit: tasks-merge-fields.test.ts "keeps the survivor’s own value that holds something, and an emptied value of the merged task moves nowhere"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const givesWay = !holdsNoInformation(merged.value) && holdsNoInformation(survivors.value)\n"
b = "    const givesWay = merged.value !== null // BROKEN: the survivor's own value gives way whatever it holds\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-4-every-value-gives-way-unit: the merged task's value overwrites the survivor's own")
