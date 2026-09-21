# Expand all keyed on the mode, so the second press is dead.
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="  }, [subtaskStamp])"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  }, [subtaskMode])"))
