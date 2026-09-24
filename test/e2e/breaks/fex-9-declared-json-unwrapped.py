# ANY DECLARED CONTENT TYPE COUNTS AS A FILE: a route that says it is JSON loses its envelope.
# Reddens: unit: response.interceptor.test.ts "still wraps a route that declared a JSON content type, or only some other header"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = '  return type !== undefined && !/json/i.test(type)\n'
b = '  return type !== undefined\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-9-declared-json-unwrapped: applied")
