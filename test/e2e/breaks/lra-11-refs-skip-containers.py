# AN AI ANSWER'S TASK CHIPS WITH THE PRIVATE-ITEM RULE ONLY, as they were.
# Re-anchored when the task reads took the list's own privacy with the
# container rule (`taskInReachFilter`; `found-24-sep/private-lists-skipped-by-task-reads`);
# the edit is the same: the rule it names is taken out.
# Reddens: lookup-read-access: "an AI answer’s references resolve no task or list of a space the member is refused — while the open ones resolve, and the admin’s resolve all four"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '                inArray(tasks.id, taskIds),\n                taskInReachFilter(this.db, workspaceId, actorId, isManager),\n'
b = '                inArray(tasks.id, taskIds),\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lra-11-refs-skip-containers: applied")
