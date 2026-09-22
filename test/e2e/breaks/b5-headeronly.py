# The header array filtered and the hand-written cells NOT — the trap.
# RE-AIMED. Putting the column back still works, so the sentence it claimed
# passes. The trap it sets is the header going and the cells staying, which is
# the check directly above the one it named.
# Reddens: list-view-controls: "and every status CELL with it"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="""                  {showCol('col:status') && (
                  <div data-testid="list-table-status-cell\""""
assert s.count(a)==1
b="""                  {(showCol('col:status') || true) && (
                  <div data-testid="list-table-status-cell\""""
io.open(p,'w',encoding='utf-8').write(s.replace(a,b))
