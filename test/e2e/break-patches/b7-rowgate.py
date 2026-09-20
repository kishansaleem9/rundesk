# Unticking Due date changes nothing on the rows.
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="      {showCol('col:due') && (onPatchTask ? ("
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"      {(showCol('col:due') || true) && (onPatchTask ? ("))
