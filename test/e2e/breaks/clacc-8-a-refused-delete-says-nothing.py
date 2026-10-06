# A REFUSED DELETE SAYS NOTHING, AS IT DID (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The delete dialog stops drawing the refusal: the server refuses, the dialog
# stays open, and nothing on screen says why.
#
# Reddens: clip-library-access: "a delete the server refuses is said in the dialog, in the server’s words, and the clip stays"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "          {removeClip.isError ? (\n"
b = "          {removeClip.isError && removeClip.isSuccess ? (\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-8-a-refused-delete-says-nothing: the dialog draws no refusal')
