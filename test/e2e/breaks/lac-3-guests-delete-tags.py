# A GUEST DELETES A TAG, as they could.
# Reddens: label-access: "a guest cannot delete a tag (403, it stays) — a member can"
import io
p = '/home/user/rundesk/apps/api/src/modules/labels/labels.service.ts'
a = '  async delete(labelId: string, actorId: string) {\n    await this.assertNotGuest(await this.workspaceOf(labelId), actorId)\n'
b = '  async delete(labelId: string, actorId: string) {\n    void actorId\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lac-3-guests-delete-tags: applied")
