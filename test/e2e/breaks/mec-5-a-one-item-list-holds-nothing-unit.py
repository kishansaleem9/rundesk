# A LIST OF ONE COUNTS AS EMPTY, for the unit test of `holdsNoInformation` (`found-6-oct/merge-drops-a-value-beside-an-emptied-one`):
# a survivor's one label would give way as if it held nothing.
# Reddens: unit: task-merge.test.ts "a value cleared, an empty text and an empty list hold no information; a value that is there holds some"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/task-merge.ts'
a = "  return v == null || v === '' || (Array.isArray(v) && v.length === 0)\n"
b = "  return v == null || v === '' || (Array.isArray(v) && v.length <= 1) // BROKEN: a list of one counts as empty\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("mec-5-a-one-item-list-holds-nothing-unit: a one-item list holds no information")
