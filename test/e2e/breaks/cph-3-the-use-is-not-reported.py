# A PHOTO CHOSEN IS NOT REPORTED TO THE LIBRARY.
# (`commit-log/log-601eacc-1`, `ledger-rows/row-739`)
# Reddens: cover-photo-search: "choosing one makes it the task’s cover — the photo’s own address, as the server holds it, drawn on the sheet, in place of the colour — and the library is told it was used, as Unsplash asks"
#   or "the library is searched for the workspace’s own members; a blank search, a page past fifty, and a photo the library does not hold are refused"
#
# Re-aimed 8 October: the last 1 of these are knock-ons of the same edit, measured on lane 8 — checks that stand on what the first ones lost.
import io
p = '/home/user/rundesk/apps/api/src/modules/cover-photos/cover-photos.controller.ts'
s = io.open(p, encoding='utf-8').read()
for a, b in [
    ('      await trackPhotoUse(cfg, photoId)\n',
     '      void trackPhotoUse // BROKEN: not reported\n'),
]:
    assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('cph-3-the-use-is-not-reported: the use is not reported')
