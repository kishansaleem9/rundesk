# AN ENTRY KEEPS THE PATH ITS NAME HOLDS (`found-30-sep/attachments-have-no-download-all`): a file's name is
# written into the zip as its uploader gave it, so `../outside.txt` is an entry that unpacks outside the folder
# it is unpacked into. The zip's own name is made safe as before.
# Reddens: task-attachments: "and its entries have distinct names that hold no path — the second notes.txt is notes (2).txt, and ../outside.txt is ._outside.txt"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-names.ts'
a = "    const name = safeEntryName(raw)\n"
b = "    const name = typeof raw === 'string' && raw ? raw : 'file'\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('zip-names.ts: an entry is named as its file was, path and all.')
