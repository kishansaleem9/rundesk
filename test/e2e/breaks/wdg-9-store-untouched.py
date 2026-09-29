# DELETE FOR GOOD LEAVES THE STORE AS IT WAS: nothing it held is removed.
# Reddens: workspace-delete-for-good: "and the files it held go from the store with it — a task’s attachment, which its row names, and a clip, which only its prefix does"
import io
p = '/home/user/rundesk/apps/api/src/modules/workspaces/workspaces.service.ts'
a = '    const removed = await this.purgeStored(stored)\n'
b = '    const removed = Boolean(0) ? await this.purgeStored(stored) : { removed: 0, failed: 0, unlisted: 0 }\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("wdg-9-store-untouched: applied")
