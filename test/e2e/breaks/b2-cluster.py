# The three loose in the toolbar again — the state the wrap came from.
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a='<div className="flex shrink-0 items-center gap-2" data-testid="list-view-controls">'
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,'<div className="contents" data-testid="list-view-controls">'))
