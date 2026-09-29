# "DELETE FOR GOOD" ARCHIVES AGAIN: the workspace and everything in it stay.
# Reddens: workspace-delete-for-good: "confirming deletes the workspace for good — its spaces and tasks with it — records who did it, and it leaves the archived list"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    await this.db.delete(workspaces).where(eq(workspaces.id, ws.id))\n'
b = '    await this.db.update(workspaces).set({ isArchived: true, updatedAt: new Date() }).where(eq(workspaces.id, ws.id))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-7-archives-again: applied")
