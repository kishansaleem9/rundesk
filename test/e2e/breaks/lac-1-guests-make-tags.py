# A GUEST MAKES A NEW TAG, as they could.
# Reddens: label-access: "a guest makes no new tag (403, none made), though typing an existing one finds it — a member makes one"
import io
p = '/home/user/rundesk/apps/api/src/modules/labels/labels.service.ts'
a = '    if (existing) return existing\n    await this.assertNotGuest(workspaceId, actorId)\n'
b = '    if (existing) return existing\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("lac-1-guests-make-tags: applied")
