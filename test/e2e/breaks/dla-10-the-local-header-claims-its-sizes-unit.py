# THE LOCAL HEADER CLAIMS TO CARRY ITS SIZES (`found-30-sep/attachments-have-no-download-all`): bit 3 is not
# set, so a reader that reads an entry from its local header takes its CRC and its sizes to be the zeros
# written there, and the data descriptor after the bytes for part of the file. Info-ZIP is such a reader
# ("invalid compressed data to inflate notes.txt"), so the tests that open an archive with it redden too
# (measured, 30 September): 4 of this file's 6, and tasks-attachments-zip.test.ts's "holds the task’s files
# in the list’s order…".
# Reddens: unit: zip-stream.test.ts "puts each entry’s CRC and sizes in a data descriptor after its bytes, zeros in its local header"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-stream.ts'
a = "const FLAGS = 0x0008 | 0x0800\n"
b = "const FLAGS = 0x0800\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-10-the-local-header-claims-its-sizes-unit: general purpose bit 3 is not set')
