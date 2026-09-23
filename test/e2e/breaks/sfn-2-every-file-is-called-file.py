# THE RULE THROWS THE NAME AWAY: every upload is keyed as `file`, whatever it was called.
# Reddens: object-key-boundaries: "while a named file keeps its name, made safe for the key"
import io
p = '/home/user/rundesk/apps/api/src/common/storage/file-name.ts'
a = "  return raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || fallback\n"
b = "  return raw.length < 0 ? raw : fallback\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("sfn-2-every-file-is-called-file: applied")
