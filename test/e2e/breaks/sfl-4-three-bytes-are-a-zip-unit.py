# THE ZIP SIGNATURE IS READ LOOSER THAN IT IS (`found-5-oct/xlsx-read-as-text`): "PK" and a 03 with no 04 after it is a zip.
# Reddens: unit: apps/web/src/lib/sheet-file.test.ts "the zip signature is “PK” and one of three pairs, nothing looser"
import io
p = '/home/user/rundesk/apps/web/src/lib/sheet-file.ts'
s = io.open(p, encoding='utf-8').read()
a = "  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) return false\n"
b = "  if (head[0] !== 0x50 || head[1] !== 0x4b) return false\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
a = "    (head[2] === 0x03 && head[3] === 0x04) ||\n"
b = "    head[2] === 0x03 ||\n"
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print("sfl-4-three-bytes-are-a-zip-unit: three bytes are a zip")
