# The mind map draws the list's tasks and none of their subtasks.
#
# Reddens: list-views: "the mind map draws a node for every task and subtask of the list"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/mindmap-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="      tops.push({ id: task.id, title: task.title ?? '', done: closed(task.statusCategory), depth: 1, parentId: null, children })"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      tops.push({ id: task.id, title: task.title ?? '', done: closed(task.statusCategory), depth: 1, parentId: null, children: [] })"))
