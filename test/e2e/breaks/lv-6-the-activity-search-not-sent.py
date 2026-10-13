# The Activity view's search box asks nothing of the server.
#
# Reddens: list-views: "its search narrows the rows to that task’s"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/activity-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    if (q) sp.set('q', q)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,""))
