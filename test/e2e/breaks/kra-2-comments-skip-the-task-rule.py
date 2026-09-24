# A COMMENT HIT IS KEPT WHATEVER ITS TASK: one on a private task is cited.
# Reddens: knowledge-read-access: "nor a comment on a private task they may not open — the admin’s cites it"
import io
p = '/home/user/rundesk/apps/api/src/modules/ai/ai.service.ts'
a = '.where(and(eq(spaces.workspaceId, workspaceId), inArray(taskComments.id, commentIds), taskOpen))'
b = '.where(and(eq(spaces.workspaceId, workspaceId), inArray(taskComments.id, commentIds)))'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("kra-2-comments-skip-the-task-rule: applied")
