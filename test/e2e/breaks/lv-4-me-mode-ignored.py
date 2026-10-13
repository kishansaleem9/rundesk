# Me Mode read and not applied: everybody's tasks come back.
#
# Reddens: list-views: "Me Mode keeps only the tasks assigned to the reader"
import io
p="/home/user/rundesk/apps/api/src/modules/tasks/tasks.service.ts"
s=io.open(p,encoding='utf-8').read()
a="      opts.me ? inArray(tasks.id, this.db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, actor.id))) : undefined,\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
