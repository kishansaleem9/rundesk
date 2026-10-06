# EVERY CARD OFFERS DELETE AGAIN (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The clips page draws Delete on every card, whatever the server says its
# reader may delete: a member is offered Delete on the admin's clip.
#
# Reddens: clip-library-access: "the clips page offers Delete on the reader’s own clip and on nobody else’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "            {clip.mayDelete === true && (\n"
b = "            {clip.mayDelete !== null && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-6-every-card-offers-delete: every card offers Delete')
