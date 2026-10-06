# TWO FAVOURITE TOGGLES IN FLIGHT TOGETHER TAKE NO TURNS again: both read "not pinned", and both pin.
# Reddens: lookup-read-access: "two favourite toggles sent together undo each other: of twenty pairs, each answers pinned once and unpinned once, and none leaves the list moved"
import io
p = '/home/user/rundesk/apps/api/src/modules/favorites/favorites.service.ts'
a = '      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`favorite:${userId}:${entityType}:${entityId}`}))`)\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lra-13-favourite-toggles-take-no-turns: favorites.service.ts: two toggles in flight together take no turns.')
