# A GUEST'S LIBRARY IS LOOKED FOR IN THE NEWEST 200 ONLY (`found-5-oct/guests-read-and-delete-every-clip`).
#
# Behind 200 newer clips of other people's, a guest's own are never listed.
#
# Reddens: unit: clips.service.test.ts "a guest’s library looks past the newest 200 for theirs"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '    for (let from = 0; from < objects.length && results.length < CLIPS_LISTED; from += CLIPS_LISTED) {\n'
b = '    for (let from = 0; from < Math.min(objects.length, CLIPS_LISTED) && results.length < CLIPS_LISTED; from += CLIPS_LISTED) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-16-a-guests-library-stops-at-the-first-page-unit: applied')
