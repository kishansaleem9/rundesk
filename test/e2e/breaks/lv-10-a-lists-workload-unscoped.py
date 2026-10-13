# A list's workload counts every list's tasks.
#
# Reddens: list-views: "another list’s Workload has none of it, and has its own"
import io
p="/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts"
s=io.open(p,encoding='utf-8').read()
a="    return this.db\n      .select({\n        taskId: tasks.id,\n        title: tasks.title,\n        userId: taskAssignees.userId,"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    scope = undefined\n    return this.db\n      .select({\n        taskId: tasks.id,\n        title: tasks.title,\n        userId: taskAssignees.userId,"))
