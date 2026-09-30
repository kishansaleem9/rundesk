# NAMES ARE KEPT APART WITH THEIR CASE (`found-30-sep/attachments-have-no-download-all`): `notes.txt` and
# `Notes.txt` are two entries, and one file once unpacked on Windows or macOS, where the second is written
# over the first.
# Reddens: unit: zip-names.test.ts "gives a repeated name the lowest (n) not yet used, comparing without case"
import io
p = '/home/user/rundesk/apps/api/src/common/export/zip-names.ts'
a = "    for (let n = 2; used.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})${ext}`\n"
b = "    for (let n = 2; used.has(candidate); n += 1) candidate = `${base} (${n})${ext}`\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('dla-16-names-are-compared-with-case-unit: a repeat is looked for with its case')
