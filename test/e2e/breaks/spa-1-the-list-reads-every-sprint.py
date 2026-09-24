# THE SPRINTS LIST TAKES NO SPACE RULE AGAIN: a private space's sprint is listed to every member.
# Reddens: sprint-access: "a member’s sprints are the open space’s and the workspace’s, not the private space’s; a guest is given none; the admin all"
import io
p = '/home/user/rundesk/apps/api/src/modules/sprints/sprints.service.ts'
a = "      .where(and(eq(sprints.workspaceId, workspaceId), reach === 'spaces' && actor ? sprintVisibilityFilter(this.db, actor.id) : undefined))\n      .orderBy(desc(sprints.startDate))\n  }\n"
b = "      .where(and(eq(sprints.workspaceId, workspaceId), reach === 'spaces' && actor ? undefined : undefined))\n      .orderBy(desc(sprints.startDate))\n  }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("spa-1-the-list-reads-every-sprint: applied")
