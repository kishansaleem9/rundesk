# A GUEST TAKES THE SPACE'S DEFAULT, as a member does: every open space's docs are theirs to edit.
# RE-AIMED 24 September: a guest's level without a grant is the resolver's rule now
# (`found-24-sep/guest-makes-lists-where-nothing-is-shared`), not a line of docLevel's.
# Reddens: doc-write-levels: "a guest does not rename an open space’s doc (403, unchanged) — a doc shared with them to edit, they do"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/space-default-permission.ts'
a = "  if (guest) return { level: 'view', source: 'guest-default' }\n  return { level: space.defaultPermission, source: 'space-default' }\n"
b = "  return { level: space.defaultPermission, source: 'space-default' }\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-3-guests-take-the-default: applied")
