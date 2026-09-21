# A new Progress field defaults to tracking subtasks alone, so a task whose work
# lives in a checklist reports nothing on the day the field is made. Frame
# `00:25` draws all three switches on; this is the field arriving with two of
# them off and no error anywhere.
#
# REPLACES an earlier patch that removed the `Math.min(done, total)` clamp. That
# one was dropped rather than kept, because NOTHING IN THE SUITE PRODUCES A
# SOURCE WITH MORE DONE THAN IT HOLDS — so it had no check to redden, and the
# claim line I first gave it named a sentence that merely happened to be in the
# file. A claim chosen because it verifies is the thing check-break-claims.mjs
# exists to catch, and writing one by hand is worse than letting it rot.
#
# Reddens: custom-field-progress:
#   "and it tracks all three sources the frame lists, by default"
import io
p = '/home/user/rundesk/apps/api/src/modules/custom-fields/progress.ts'
a = '  sources: { subtasks: true, checklists: true, assignedComments: true },\n'
b = '  sources: { subtasks: true, checklists: false, assignedComments: false },\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('progress.ts: a new Progress field tracks subtasks only.')
