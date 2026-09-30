# ADD TO › PERSONAL PRIORITIES PUTS THE TASK ON YOUR OWN LIST, WHOEVER IS CHOSEN.
#
# `ledger-rows/row-845`. The menu calls the caller's own add for every person.
# The toast says "added", and the colleague's list never changes.
#
# ONE CHECK: their list, read from the database.
#
# Reddens: assign-to-priorities: "and choosing a colleague there puts the task on their priorities, as added by you"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                                  mine ? menuPriorityAdds.addMine() : menuPriorityAdds.addTheirs({ userId: m.userId, name })\n"
b = "                                  menuPriorityAdds.addMine()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-39-add-to-lands-on-your-own-list: every choice adds to your own list')
