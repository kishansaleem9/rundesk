# THE PANEL IS TOLD THE READER'S LEVEL FROM THEIR GRANTS ALONE, so a member at Edit by the space's default is offered no level.
# Reddens: share-levels: "the Share panel offers a member at Edit the levels up to Edit and not Full edit, and tells a view-only member they cannot share"
import io
p = '/home/user/rundesk/apps/api/src/modules/shares/shares.controller.ts'
a = '    return { items, myLevel: may.level, canShare: may.allowed, levels: SHARE_LEVELS, types: SHARE_TYPES }'
b = '    return { items, myLevel: await this.shares.resolveLevel(type, objectId, user.id), canShare: may.allowed, levels: SHARE_LEVELS, types: SHARE_TYPES }'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('shl-9-my-level-from-grants-alone: applied')
