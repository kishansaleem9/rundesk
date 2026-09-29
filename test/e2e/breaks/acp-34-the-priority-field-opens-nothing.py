# THE PRIORITY FIELD'S "ADD TO PERSONAL PRIORITIES" OPENS NOTHING.
#
# `found-29-sep/priority-field-adds-to-nobody-else`. The button is drawn and
# pressing it lists nobody, which is where the product stood before: assigning
# was the only way a task reached anybody's priorities.
#
# THREE CHECKS: the people offered, and both adds after them, which have no
# list to choose from.
#
# Reddens: assign-to-priorities: "the Priority field offers Personal Priorities by person, yours first, then your colleagues"
import io
p = '/home/user/rundesk/apps/web/src/components/task-detail-sheet.tsx'
a = "              {priorityPeopleOpen && (\n"
b = "              {false && priorityPeopleOpen && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('acp-34-the-priority-field-opens-nothing: the list never opens')
