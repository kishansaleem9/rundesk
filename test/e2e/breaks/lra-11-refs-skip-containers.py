# AN AI ANSWER'S TASK CHIPS WITH THE PRIVATE-ITEM RULE ONLY, as they were.
# Reddens: lookup-read-access: "an AI answer’s references resolve no task or list of a space the member is refused — while the open ones resolve, and the admin’s resolve all four"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '                inArray(tasks.id, taskIds),\n                containerVisibilityFilter(this.db, actorId, isManager),\n'
b = '                inArray(tasks.id, taskIds),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-11-refs-skip-containers: applied")
