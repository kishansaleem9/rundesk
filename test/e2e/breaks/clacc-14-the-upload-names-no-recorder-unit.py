# THE UPLOAD NAMES ITS RECORDER BY ADDRESS ALONE (`found-5-oct/guests-read-and-delete-every-clip`).
#
# A clip is known by an address, which can change, and not by who
# recorded it.
#
# Reddens: unit: clips.service.test.ts "the upload names its recorder by id as well as by address"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '        recordedbyid: actor.id,\n'
b = ''
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-14-the-upload-names-no-recorder-unit: applied')
