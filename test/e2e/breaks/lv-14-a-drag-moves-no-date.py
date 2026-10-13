# A bar dragged along its row moves nothing: the days are not counted.
#
# Reddens: list-views: "dragging the bar two days along its row moves its start and due by two days"
import io
p="/home/user/rundesk/apps/web/src/components/list-views/timeline-view.tsx"
s=io.open(p,encoding='utf-8').read()
a="    const delta = Math.round((e.clientX - d.x0) / dayW)\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    const delta = 0\n"))
