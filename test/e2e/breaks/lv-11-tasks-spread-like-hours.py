# By Tasks, a task spread over its days like an estimate: a fifth of one on each of five.
#
# Reddens: list-views: "by Tasks, a task counts once on every day of its span"
import io
p="/home/user/rundesk/apps/api/src/modules/reports/workload-spread.ts"
s=io.open(p,encoding='utf-8').read()
a="    measure === 'tasks'\n      ? 1\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    measure === 'tasks'\n      ? 1 / length\n"))
