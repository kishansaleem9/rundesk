# Nothing to count reports 0% instead of nothing. Zero is a CLAIM — "none of
# this work is done" — and on a task with no subtasks, no checklist and no
# assigned comments there is no work to make that claim about. The field is
# populated on every task in the list and every one of them is a lie that
# reads like data.
#
# Reddens: custom-field-progress:
#   "a task with no subtasks, checklist or assigned comments reports null"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/progress.ts'
a = '  if (total === 0) return config.doneStatusIs100 && taskIsDone ? 100 : null\n'
b = '  if (total === 0) return config.doneStatusIs100 && taskIsDone ? 100 : 0\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('progress.ts: nothing to count now reports 0% rather than nothing at all.')
