# Unticking Due date changes nothing on the rows.
# RE-AIMED. Ticking it back is unaffected — the gate is always true, so the
# column is always there and re-ticking looks like it worked. What fails is the
# unticking.
# Re-aimed 25 September: the row's date is offered by what its reader may change now (`list-page-offers-refused-edits`); the gate is the same.
# Reddens: list-view-controls: "unticking Due date takes it off every row"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="      {showCol('col:due') && (mayEdit ? ("
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      {(showCol('col:due') || true) && (mayEdit ? ("))
