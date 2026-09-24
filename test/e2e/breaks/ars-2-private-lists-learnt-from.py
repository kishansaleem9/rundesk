# SUGGESTIONS LEARN FROM A PRIVATE LIST'S TASKS in a project the reader may open.
# Reddens: ai-read-access: "a member’s suggestions carry no title or name from a space or a list they are refused — the admin’s carry both"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '          isNull(tasks.parentTaskId),\n          listVisibilityFilter(reader.id, isManager),\n'
b = '          isNull(tasks.parentTaskId),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("ars-2-private-lists-learnt-from: applied")
