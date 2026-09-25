# SHARING READS THE GRANTS ALONE, as it did: a member at Full edit by the space's default shares nothing of the admin's.
# Reddens: share-levels: "a member shares by the level the space gives them, as ClickUp’s edit permissions do: at Full edit the admin’s list up to Full edit, at Edit up to Edit, at View not at all — and a guest shares nothing, even with Edit"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.service.ts'
a = '    const resolved = await resolveSpaceLevel(this.db, { spaceId: space.id, actorId: actor.id, within })\n    return (resolved?.level as ShareLevel | undefined) ?? null\n'
b = '    void resolveSpaceLevel\n    void within\n    return null\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-5-space-level-unread: applied')
