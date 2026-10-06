# A REFUSED DELETE IS SAID IN THE PAGE'S WORDS, NOT THE SERVER'S (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The dialog says only that the clip could not be deleted, never who may
# delete it, which the server's refusal says.
#
# Reddens: clip-library-access: "a delete the server refuses is said in the dialog, in the server’s words, and the clip stays"
import io
p = '/home/user/rundesk/apps/web/src/pages/workspace-clips-page.tsx'
a = "              {refusalMessage(removeClip.error, t('clips.deleteFailed'))}\n"
b = "              {t('clips.deleteFailed')}\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-9-a-refused-delete-says-its-own-words: the dialog says its own words')
