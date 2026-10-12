# THE SERVICE'S READ CHECK AS IT WAS: containers only. A private task in a list
# the reader can see is visible to them as far as every service path is concerned,
# though the task's own GET refuses them.
# Reddens: task-boundaries: "including a PRIVATE task in a list they can otherwise see — the rule the route’s guard applied and the service did not"
#
# Re-aimed 12 October: the list's privacy and the task's are asked apart now (a
# private list is let go when a list the task was added to lets the reader in);
# both go. Same break.
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "    if (ctx.taskVisibility === 'private') {\n"
b = '    if (false) {\n'
a2 = '      !canSeePrivateItem({ visibility: ctx.listVisibility, createdById: ctx.listCreatedById, personalOf: ctx.listPersonalOf }, { userId: actorId, isManager }) &&\n'
b2 = '      false &&\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
assert s.count(a2) == 1, f'anchor appears {s.count(a2)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b).replace(a2, b2))
print("tb-22-item-privacy-ignored: applied")
