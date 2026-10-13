# The Workload view's No estimate section left out.
#
# Reddens: list-views: "the Workload tab draws the assignee’s day with its load and capacity, and lists the unestimated and the unscheduled"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/workload-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="            {measure !== 'tasks' && (\n              <BacklogSection"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"            {false && (\n              <BacklogSection"))
