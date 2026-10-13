# Group by read and not applied: every grouping is by assignee.
#
# Reddens: list-views: "grouped by Status, the task is on its status’s row"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/timeline-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    if (groupBy === 'status') return [task.status]\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
