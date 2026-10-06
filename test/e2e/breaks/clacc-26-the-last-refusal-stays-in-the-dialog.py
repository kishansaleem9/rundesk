# THE LAST REFUSAL STAYS IN THE DELETE DIALOG (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The dialog's delete is not reset when it is opened: a refusal from one clip's
# delete is drawn again when Delete is opened on the next, over a clip the
# reader may delete.
#
# Reddens: clip-library-access: "the delete dialog opens on the next clip without the last one’s refusal"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = '                removeClip.reset()\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-26-the-last-refusal-stays-in-the-dialog: the delete dialog keeps the last refusal')
