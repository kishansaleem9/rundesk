# A GUEST RENAMES A TAG, as they could.
# Reddens: label-access: "a guest cannot rename a tag (403, unchanged) — a member can"
import io
p = '/home/user/rundesk/apps/api/src/modules/labels/labels.service.ts'
a = '  async update(labelId: string, data: { name?: string; color?: string }, actorId: string) {\n    await this.assertNotGuest(await this.workspaceOf(labelId), actorId)\n'
b = '  async update(labelId: string, data: { name?: string; color?: string }, actorId: string) {\n    void actorId\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lac-2-guests-rename-tags: applied")
