# THE SHARED RULE READS THE NAME BEFORE IT KNOWS THERE IS ONE, as three of the four copies did.
# A request with no fileName throws a TypeError, and every upload route answers 500.
# Reddens: object-key-boundaries: "an upload with no file name is given a safe one on every route that names an object — not a 500"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/file-name.ts'
a = "  const raw = typeof input === 'string' ? input : ''\n"
b = "  const raw = input as string\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfn-1-the-name-is-read-before-it-is-checked: applied")
