# THE SURVIVOR'S OWN VALUE GIVES WAY WHATEVER IT HOLDS (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`, the other side):
# the merged task's value overwrites a survivor's value that holds something.
# Reddens: task-merge: "and a survivor’s own value that holds something stays: the merged task’s stays on the binned task, and the merge counts no field moved (read by SQL)"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    const givesWay = !holdsNoInformation(merged.value) && holdsNoInformation(survivors.value)\n"
b = "    const givesWay = merged.value !== null // BROKEN: the survivor's own value gives way whatever it holds\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-2-every-value-gives-way: the merged task's value overwrites the survivor's own")
