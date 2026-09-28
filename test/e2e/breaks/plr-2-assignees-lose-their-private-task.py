# THE WORKSPACE LIST'S PRIVATE-ITEM RULE IS THE CREATOR'S ALONE, as its copy was: a private task disappears from its assignee's list.
# Reddens: private-list-reach: "the member’s workspace list has no task of the private list, even searched for, and has the private task assigned to them — the admin’s has it"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
a = '        readable = and(taskInReachFilter(this.db, workspaceId, actorId, false), taskVisibilityFilter(this.db, actorId, false))\n'
b = "        readable = and(taskInReachFilter(this.db, workspaceId, actorId, false), or(sql`${tasks.visibility} <> 'private'`, eq(tasks.createdById, actorId)))\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("plr-2-assignees-lose-their-private-task: applied")
