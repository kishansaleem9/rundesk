# A MEMBER DELETES FOR GOOD WHAT THEY DELETED: permanent deletion asks only whose it was.
# Reddens: trash-rules: "a member restores what they deleted, and deletes nothing for good — not even their own (403, it stays in the Trash)"
import io
p = '/home/user/rundesk/apps/api/src/modules/trash/trash.service.ts'
s = io.open(p, encoding='utf-8').read()
a = "    await this.assertAdmin(workspaceId, actor)\n    const row = await this.assertMayAct(workspaceId, actor, type, id)\n"
b = "    const row = await this.assertMayAct(workspaceId, actor, type, id)\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('trr-2-members-delete-their-own-for-good: purge asks whose it was')
