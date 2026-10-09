# A PHOTO CHOSEN CLOSES THE PICKER AND SETS NOTHING.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "choosing one makes it the task’s cover — the photo’s own address, as the server holds it, drawn on the sheet, in place of the colour — and the library is told it was used, as Unsplash asks"
import io
p = '/home/user/rundesk/apps/web/src/components/cover-image-picker.tsx'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ("                <CoverPhotoSearch workspaceId={workspaceId} onChoose={(photo) => commit({ kind: 'link', url: photo.url })} />\n",
     '                <CoverPhotoSearch workspaceId={workspaceId} onChoose={(photo) => { void photo; onOpenChange(false) }} />\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-w4-a-photo-chosen-is-not-the-cover: a photo chosen is not the cover')
