# The Subtasks mode is not part of the view, so the Save chip never notices.
# Reddens: list-view-controls: "changing the Subtasks mode marks the view unsaved"
import io
p='/home/user/rundesk/apps/web/src/routes/app.$workspaceId.$spaceId.$projectId.$listId.tsx'
s=io.open(p,encoding='utf-8').read()
a="    hiddenFields: Array.from(hiddenFields),\n    subtaskMode,\n"
assert s.count(a)==1
io.open(p,'w',encoding='utf-8').write(s.replace(a,"    hiddenFields: Array.from(hiddenFields),\n"))
