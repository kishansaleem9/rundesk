# HALF A FIELD. `create` takes a description and `update` drops it, so the
# words can be set at birth and never altered. The edit dialog draws the box,
# accepts the typing and saves without complaint — the PATCH goes out, the
# server answers 200, and the column does not move.
# Reddens: folder-dialog: "and editing it there writes the new words back"
import io
p = '/home/user/rundesk/apps/api/src/modules/folders/folders.service.ts'
a = "    if (patch.description !== undefined) set.description = patch.description?.trim() || null"
b = "    // update no longer carries the description"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('folders.service.ts: a description can be set once and never changed.')
