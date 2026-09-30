# THE TAB DRAWS THE TASK'S OWN ROWS UNTIL ITS LIST ANSWERS (`found-30-sep/attachments-tab-draws-twice`,
# the first half). Nothing is waited for: the cards are drawn from the rows `getTask` carries, which have
# no url, so the first draw has no Download and no Expand, and every card is drawn again when the list answers.
# Reddens: task-attachments: "and its first draw already has its Download link — the cards are drawn from the list, not from the task's own rows"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "\n  const waiting = listed === undefined && !probe.isError\n"
b = "\n  const waiting = false\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('task-detail-sheet.tsx: the attachments tab draws the task\'s own rows, with no links, until its list answers.')
