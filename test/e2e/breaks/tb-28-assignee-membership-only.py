# A RULE THAT ASKS ONLY WHETHER THEY BELONG TO THE WORKSPACE. The obvious half-fix:
# it stops the outsider and assigns a member to a task in a private project they
# cannot open — whose title the notification then hands them.
# Reddens: task-boundaries: "nor to a member who cannot see it — here, a task in a private project they are not in"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '    try {\n      await this.assertTaskReadAccess(taskId, userId)\n    } catch {\n      throw new BadRequestException(PERSON_CANNOT_SEE[as])\n    }\n'
b = '    const [m] = await this.db\n      .select({ userId: workspaceMembers.userId })\n      .from(tasks)\n      .innerJoin(lists, eq(lists.id, tasks.listId))\n      .innerJoin(projects, eq(projects.id, lists.projectId))\n      .innerJoin(spaces, eq(spaces.id, projects.spaceId))\n      .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, spaces.workspaceId))\n      .where(and(eq(tasks.id, taskId), eq(workspaceMembers.userId, userId)))\n      .limit(1)\n    if (!m) throw new BadRequestException(PERSON_CANNOT_SEE[as])\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("tb-28-assignee-membership-only: applied")
