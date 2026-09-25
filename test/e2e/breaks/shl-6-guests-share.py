# A GUEST SHARES WHAT IS SHARED WITH THEM AT EDIT.
# Reddens: share-levels: "a member shares by the level the space gives them, as ClickUp’s edit permissions do: at Full edit the admin’s list up to Full edit, at Edit up to Edit, at View not at all — and a guest shares nothing, even with Edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = "    if (actor.role !== 'super_admin' && (await this.workspaceRole(loc.workspaceId, actor.id)) === 'guest') {\n"
b = "    if (actor.role !== 'super_admin' && (await this.workspaceRole(loc.workspaceId, actor.id)) === 'guest' && actor.id === '') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-6-guests-share: applied')
