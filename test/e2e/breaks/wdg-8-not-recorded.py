# THE DELETION IS NOT RECORDED: the workspace goes and nothing says who took it.
# Reddens: workspace-delete-for-good: "confirming deletes the workspace for good — its spaces and tasks with it — records who did it, and it leaves the archived list"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = "      action: 'workspace.deleted',\n"
b = "      action: 'workspace.deleted.unrecorded',\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-8-not-recorded: applied")
