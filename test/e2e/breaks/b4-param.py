# The parameter nothing had ever sent, not sent again.
# Reddens: list-view-controls: "and it had not been asking before — the other two modes do not"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="      if (subtaskMode === 'separate') q.set('includeSubtasks', 'true')\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
