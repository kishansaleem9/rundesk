# A task with no estimate given four hours again, as the workload page used to.
#
# Reddens: list-views: "a task with no estimate is listed under No estimate and adds no hours"
import io
p="/home/user/rundesk/apps/api/src/modules/reports/workload-spread.ts"
s=io.open(p,encoding='utf-8').read()
a="  if (measure === 'hours') return (task.timeEstimate ?? 0) > 0\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  if (measure === 'hours') return true\n"))
