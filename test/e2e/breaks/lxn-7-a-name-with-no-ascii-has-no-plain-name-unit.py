# A NAME WITH NO ASCII IN IT HAS NO PLAIN NAME (`found-30-sep/list-export-saved-as-list-csv`): the fallback is
# not used for the ASCII `filename`, so a list or a task named in Arabic goes out as `filename=".xlsx"` or
# `filename="-attachments.zip"` to any client that reads only that. (It reddens tasks-attachments-zip.test.ts
# "names it <title>-attachments.zip, made safe, with the whole name in filename*" as well, measured 30 September.)
# Reddens: unit: download-name.test.ts "falls back where a name leaves nothing, or nothing ASCII"
import io
p = '/home/user/rundesk/apps/api/src/common/export/download-name.ts'
a = "      .trim() || fallback\n"
b = "      .trim()\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('lxn-7-a-name-with-no-ascii-has-no-plain-name-unit: the ASCII name has no fallback')
