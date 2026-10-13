# '+' on a task makes a task of the list, not a subtask of the node it was pressed on.
#
# Reddens: list-views: "+ on a task makes one subtask of it, which the task’s own read has"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/mindmap-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    const parent = target === 'root' ? null : target\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    const parent = null\n"))
