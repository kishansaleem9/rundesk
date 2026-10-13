# A node dropped on another asks nothing of the server.
#
# Reddens: list-views: "dropping a task on another makes it that task’s subtask"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/mindmap-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    await onReparent(id, target)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
