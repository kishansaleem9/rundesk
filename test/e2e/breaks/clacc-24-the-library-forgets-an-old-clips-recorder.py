# THE LIBRARY FORGETS WHO RECORDED A CLIP FROM BEFORE THE ID (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The library's routes read their reader without an address: a member's clip
# from before clips carried their recorder's id is listed to them without
# Delete and their delete is refused, and a guest's leaves their library.
#
# Reddens: clip-library-access: "a clip stored before clips carried their recorder’s id is its recorder’s by their address — listed with Delete, found and deleted by them, its link refused them only as a guest’s public one — and nobody else’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    return clipReaderOf(this.db, workspaceId, userId)\n'
b = '    return clipReaderOf(this.db, workspaceId, userId).then((reader) => ({ ...reader, email: null }))\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-24-the-library-forgets-an-old-clips-recorder: the library reads its reader without an address')
