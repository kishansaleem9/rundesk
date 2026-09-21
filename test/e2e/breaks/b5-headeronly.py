# The header array filtered and the hand-written cells NOT — the trap.
# Reddens: list-view-controls: "and ticking it puts both back"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="""                  {showCol('col:status') && (
                  <div data-testid="list-table-status-cell\""""
assert s.count(a)==1
b="""                  {(showCol('col:status') || true) && (
                  <div data-testid="list-table-status-cell\""""
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
