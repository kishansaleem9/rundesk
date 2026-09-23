# THE SHARED RULE THROWS ON A MISSING NAME, measured by its own unit test.
# Reddens: unit: file-name.test.ts "falls back when there is no name at all, instead of throwing"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/file-name.ts'
a = "  const raw = typeof input === 'string' ? input : ''\n"
b = "  const raw = input as string\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfn-4-no-name-throws: applied")
