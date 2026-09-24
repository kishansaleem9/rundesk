# A GUEST WITH NOTHING SHARED HOLDS THE SPACE'S DEFAULT AGAIN — the members'
# level — so they make lists in any open space and comment on its tasks.
# Reddens: guest-space-level: "a guest makes no list in an open space not shared with them (403, none made) — a member does, and so does the guest where the space is shared with them to edit"
#   or "a guest comments on no task of an open space not shared with them (403, none written) — a member does, and so does the guest where the space is shared with them to comment"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "  if (guest) return { level: 'view', source: 'guest-default' }\n  return { level: space.defaultPermission, source: 'space-default' }\n"
b = "  return { level: space.defaultPermission, source: 'space-default' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('gsl-1-guest-holds-the-default: a guest holds the space default')
