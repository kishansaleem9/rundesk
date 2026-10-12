# A PRIVATE TASK IS READ THROUGH A LIST IT WAS ADDED TO.
# (`commit-log/log-713a611-1`)
# Reddens: tasks-in-multiple-lists: "a private task added to a list everybody may open stays private: Max is refused it by id and the team list does not draw it for him — it does for Mia"
#
# Read through an added list, a task’s own privacy is not asked — by the guard, nor by the service behind it.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("    if (ctx.taskVisibility === 'private') {\n      // `asAssignee`: the question is whether they could see it ONCE\n",
     "    if (ctx.taskVisibility === 'private' && !throughAdded) { // BROKEN: not asked through an added list\n      // `asAssignee`: the question is whether they could see it ONCE\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
p = '/home/user/rundesk/apps/api/src/modules/auth/guards/resource-member.guard.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("        item.taskVisibility !== undefined &&\n        !canSeePrivateItem(\n",
     "        item.taskVisibility !== undefined &&\n        !(resolved.guestTarget?.kind === 'task' && (await readsThroughAddedList(this.db, workspaceId, resolved.guestTarget.id, { id: user.id, role: member.role as string }))) && // BROKEN\n        !canSeePrivateItem(\n"),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('tml-8-a-private-task-read-through-a-list: A PRIVATE TASK IS READ THROUGH A LIST IT WAS ADDED TO.')
