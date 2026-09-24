# A GUEST TAKES THE SPACE'S DEFAULT, as a member does: every open space's docs are theirs to edit.
# Reddens: doc-write-levels: "a guest does not rename an open space’s doc (403, unchanged) — a doc shared with them to edit, they do"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = "    if (guest && resolved.source === 'space-default') return 'view'\n"
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dwl-3-guests-take-the-default: applied")
