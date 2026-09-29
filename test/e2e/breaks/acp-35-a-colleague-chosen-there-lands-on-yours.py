# A COLLEAGUE CHOSEN IN THE PRIORITY FIELD PUTS THE TASK ON YOUR OWN LIST.
#
# `found-29-sep/priority-field-adds-to-nobody-else`. Both people call one add,
# the caller's own, which is the easy write and the wrong one. The toast still
# says "added", and the colleague's list never changes.
#
# ONE CHECK: their list, read from the database.
#
# Reddens: assign-to-priorities: "choosing a colleague there puts the task on their priorities, as added by you, and not on yours"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "                            else addToTheirPriorities({ userId: m.userId, name })\n"
b = "                            else addToMyPriorities()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-35-a-colleague-chosen-there-lands-on-yours: every choice adds to your own list')
