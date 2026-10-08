# A CLIP FROM BEFORE THE RECORDER'S ID IS NOBODY'S (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The reader is read without their address, for every route that asks: a clip
# stored before clips carried their recorder's id names its recorder by address
# alone, so it is nobody's — its recorder is offered no Delete and refused one,
# and a guest loses their old clips from their library and their search.
#
# Reddens: clip-library-access: "a clip stored before clips carried their recorder’s id is its recorder’s by their address — listed with Delete, found and deleted by them, its link refused them only as a guest’s public one — and nobody else’s"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clip-reader.ts'
a = '    email: row?.email ?? null,\n'
b = '    email: null,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-23-an-old-clip-is-nobodys: the clip reader has no address')
