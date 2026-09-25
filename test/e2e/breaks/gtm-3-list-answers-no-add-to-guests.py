# THE LIST TELLS A GUEST THEY MAY NOT ADD, WHATEVER IS SHARED WITH THEM.
# Reddens: guest-task-making: "the list page offers the guest Add task and the add rows in the list at Full edit, and neither in the one at Edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = '      this.canCreateTaskIn(listId, actor.id),\n'
b = "      this.canCreateTaskIn(listId, actor.id).then(async (may) => may && (await this.db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, home.workspaceId), eq(workspaceMembers.userId, actor.id))).limit(1))[0]?.role !== 'guest'),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gtm-3-list-answers-no-add-to-guests: applied')
