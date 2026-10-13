# A task dropped from Unscheduled onto a day is not scheduled.
#
# Reddens: list-views: "a task with no date waits in Unscheduled, and dropping it on a day gives it that due date"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/timeline-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="                    onDrop={(e) => void onGridDrop(e)}\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
