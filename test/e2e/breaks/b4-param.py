# The parameter nothing had ever sent, not sent again.
# RE-AIMED. The sentence it claimed is the NEGATIVE control beside the real
# check — "the other two modes do not ask" is still true with the parameter
# deleted, and passes. What breaks is the asking itself.
# Reddens: list-view-controls: "the page asks the server for the children (includeSubtasks=true)"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="      if (subtaskMode === 'separate') q.set('includeSubtasks', 'true')\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,''))
