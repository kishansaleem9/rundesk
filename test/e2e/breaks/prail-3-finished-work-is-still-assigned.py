# "ASSIGNED TO ME" KEEPS FINISHED WORK: the member endpoint's open-work rule is dropped.
#
# RE-AIMED 24 September. As first written it removed the rail's own filter
# (`openAssigned` in workspace-planner-page.tsx), and reddened nothing: the
# endpoint the rail reads has returned open work only since `ecd6bb0`
# (`home-today-overdue-includes-closed`), so that filter restates the server's
# rule. This takes the rule out where it lives.
# Reddens: planner-rail: "and leaves out what is already finished"
import io
p = '/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts'
a = "          or(isNull(tasks.statusCategory), sql`${tasks.statusCategory} <> 'closed'`),\n          taskInReachFilter(this.db, workspaceId, actor.id, isManager),\n"
b = "          taskInReachFilter(this.db, workspaceId, actor.id, isManager),\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("prail-3-finished-work-is-still-assigned: applied")
