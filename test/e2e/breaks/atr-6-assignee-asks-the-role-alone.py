# AN ASSIGNEE IS SUGGESTED FOR ANY TASK A MEMBER NAMES: the suggestion asks their role and not the task's read rule.
# Re-anchored 30 September: the read rule is asked first now, and answers `unknown_task` (`found-30-sep/private-task-reads-say-403`, review).
# Reddens: ai-task-reads: "an assignee is suggested for no task the asker may not open — the private list’s, and this workspace’s task asked by a user of another organisation, are answered word for word as an id naming nothing, with no pick — and for one they read, it is"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = "    if (!(await readableTask(this.db, row.workspaceId, taskId, { id: actorId }))) return refuseAssign('unknown_task')\n"
b = ""
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('atr-6-assignee-asks-the-role-alone: the suggestion asks the role alone')
