# The `team` entry gone from the label map again — the defect, exactly.
# vite does not typecheck, so this builds; the row renders its raw key.
#
# Reddens: space-wizard-views: "rows, keyed to the server's set in its order"
import io
p='/home/user/rundesk/apps/web/src/lib/space-views.ts'
s=io.open(p,encoding='utf-8').read()
a="  gantt: 'list.viewGantt',\n  team: 'list.viewTeam',\n}"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  gantt: 'list.viewGantt',\n}"))
