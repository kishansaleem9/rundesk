# TWO FILES OF ONE NAME SHARE IT IN THE ZIP (`found-30-sep/attachments-have-no-download-all`): a repeated
# name is never given " (2)", so a task's two `notes.txt` are two entries called `notes.txt`, and unpacking
# the zip writes the second over the first.
# Reddens: task-attachments: "and its entries have distinct names that hold no path — the second notes.txt is notes (2).txt, and ../outside.txt is ._outside.txt"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-names.ts'
a = "    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})${ext}`\n"
b = "    for (let n = 2; false; n += 1) candidate = `${base} (${n})${ext}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('zip-names.ts: a repeated name is written as it is, twice.')
