# The workspace page counts a task with no estimate nowhere and says nothing of it.
#
# Reddens: list-views: "the workspace page counts the same hours and says which tasks it does not count"
import io
p="/home/user/rundesk/apps/api/src/modules/reports/reports.service.ts"
s=io.open(p,encoding='utf-8').read()
a="        unestimatedTasks: unestimatedByUser.get(member.userId) ?? 0,"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"        unestimatedTasks: 0,"))
