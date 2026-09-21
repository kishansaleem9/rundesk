# Expand all keyed on the mode, so the second press is dead.
# Reddens: list-view-controls: "the parent loses its expander, having nothing left to expand"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="  }, [subtaskStamp])"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  }, [subtaskMode])"))
