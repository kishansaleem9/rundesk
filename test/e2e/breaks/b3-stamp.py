# Expand all keyed on the mode, so the second press is dead.
# RE-AIMED. It claimed "the parent loses its expander, having nothing left to
# expand" — a check about the collapsed state, which still passes. The effect
# keyed on the mode is that the SECOND press does nothing, which is the check
# below it, and the log says so.
# Reddens: list-view-controls: "choosing Expand all again re-expands it"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="  }, [subtaskStamp])"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"  }, [subtaskMode])"))
