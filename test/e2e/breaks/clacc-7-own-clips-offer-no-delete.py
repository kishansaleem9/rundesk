# THE PAGE READS `mayDelete` BACKWARDS (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Delete is drawn on the cards the reader may not delete and missing from the
# ones they may: the guest's own clip offers no Delete.
#
# Reddens: clip-library-access: "the guest’s clips page draws their own clip, with its Delete, and nobody else’s"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "            {clip.mayDelete === true && (\n"
b = "            {clip.mayDelete === false && (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-7-own-clips-offer-no-delete: Delete is drawn on the wrong cards')
