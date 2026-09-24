# THE DECLARED HEADER IS LOOKED FOR IN LOWER CASE ONLY: every route writes 'Content-Type', so no CSV is recognised.
# Reddens: file-exports: "the audit log downloads as CSV, its header row first"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = "  const type = declared?.find((h) => h.name.toLowerCase() === 'content-type')?.value\n"
b = "  const type = declared?.find((h) => h.name === 'content-type')?.value\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-5-header-name-case: applied")
