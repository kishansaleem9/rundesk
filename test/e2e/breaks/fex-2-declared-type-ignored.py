# THE ENVELOPE IGNORES A DECLARED CONTENT TYPE: a CSV string is wrapped, and Fastify refuses to send an object as text/csv (500).
# Reddens: file-exports: "a custom report downloads as CSV: text/csv, its header row first"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = '  return type !== undefined && !/json/i.test(type)\n'
b = '  return false && type !== undefined\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-2-declared-type-ignored: applied")
