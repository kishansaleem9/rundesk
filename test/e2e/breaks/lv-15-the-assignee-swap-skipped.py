# A bar dropped on another person's row changes nobody's tasks.
#
# Reddens: list-views: "dragging it onto another person’s row reassigns it to them"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/timeline-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="      if (target !== null && target !== d.group) await regroup(task, d.group, target)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
