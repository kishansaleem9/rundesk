# PINNING WITH NO VIEWER RULE, as it was: any task of the workspace may be pinned, and its title read back.
# Reddens: workspace-read-access: "and a member cannot pin a task they may not open to read its title back (404 and no row, for a refused space and a private task) — while they pin an open one"
import io
p = '/home/user/rundesk/apps/api/src/modules/people/people.service.ts'
a = '        .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId), (await this.viewerFilter(workspaceId, userId)).where))\n'
b = '        .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wra-32-pin-any-task: applied")
