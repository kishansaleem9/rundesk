# READING A CONTAINER IS ENOUGH TO SHAPE ITS STATUSES AGAIN: the space's level is
# never asked, so a view-only space's member makes, renames and deletes them.
# Re-aimed 25 September: the rule passes the chain a grant is read on now (`project-roles-narrow-nothing`).
# Reddens: status-write-access: "a member of a view-only space makes no status on it, its project or its list (403, none made) — in an open space the same member makes one"
#   or "a list in a view-only space keeps its statuses when a member switches them (403, unchanged) — the admin switches them"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/status-access.ts'
s = io.open(p, encoding='utf-8').read()
a = "  await assertSpaceLevel(db, { spaceId: place.spaceId, actorId: params.actorId, required: 'edit', kind: 'statuses', within: place.within })\n"
b = "  if (params.actorId === '') await assertSpaceLevel(db, { spaceId: place.spaceId, actorId: params.actorId, required: 'edit', kind: 'statuses', within: place.within })\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swa-2-reading-is-enough: the level is never asked')
