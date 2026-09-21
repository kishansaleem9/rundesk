# Every item is inserted at position 0, so a checklist stops keeping the order
# it was typed in. Nothing errors and every item is present; the list simply
# reads in whatever order the query plan returns, which changes after updates
# and after a vacuum — the same shape as the sidebar tree bug, one level down.
#
# THIS PATCH HAD NO CHECK TO REDDEN when it was written, and the claim line I
# first gave it named a sentence about which CHECKLIST an item lands in, which
# position does not affect. That is a claim chosen because it verifies, and it
# is the second time today I have caught myself doing it. `addChecklistItem`
# writes `position: max + 1` and `getTask` reads back `orderBy: asc(position)` —
# a writer and a reader that nothing compared — so the suite gained the check
# rather than the patch being deleted.
#
# Reddens: checklists: "two items in one checklist keep the order they were typed in"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '        position: (existing?.maxPos ?? -1) + 1,\n'
b = '        position: 0,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: every checklist item is inserted at position 0.')
