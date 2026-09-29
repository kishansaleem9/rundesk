# THE KEYS ARE READ AFTER THE ROWS ARE GONE: nothing names the attachment any more.
# Reddens: workspace-delete-for-good: "and the files it held go from the store with it — a task’s attachment, which its row names, and a clip, which only its prefix does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    const stored = await this.storedKeysOf(ws.id)\n    await this.db.delete(workspaces).where(eq(workspaces.id, ws.id))\n'
b = '    await this.db.delete(workspaces).where(eq(workspaces.id, ws.id))\n    const stored = { ...(await this.storedKeysOf(ws.id)), prefixes: [`workspaces/${ws.id}/clips/`] }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-11-keys-read-after: applied")
