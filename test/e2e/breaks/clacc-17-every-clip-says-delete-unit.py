# EVERY LISTED CLIP SAYS ITS READER MAY DELETE IT (`found-5-oct/guests-read-and-delete-every-clip`).
#
# The page offers Delete where the server refuses it.
#
# Reddens: unit: clips.service.test.ts "every listed clip says whether its reader may delete it"
import io
p = '/home/user/rundesk/apps/api/src/modules/clips/clips.service.ts'
a = '        mayDelete: mayDeleteClip(head.Metadata, reader),\n'
b = '        mayDelete: true,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('clacc-17-every-clip-says-delete-unit: applied')
