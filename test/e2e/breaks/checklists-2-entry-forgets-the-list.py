# The entry is written and drops the checklist's name, so with more than one
# named checklist on a task the feed reads "added a checklist item" and cannot
# say which list grew. The log is present, timestamped and attributed — and
# useless for the question it is read for.
#
# Reddens: checklists: "and the entry says which item went into which checklist"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "      meta: { itemId: item.id, content: item.content, checklist: parent.title },\n"
b = "      meta: { itemId: item.id, content: item.content },\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('tasks.service.ts: the activity entry no longer names the checklist.')
