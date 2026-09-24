# NOTHING IS WRAPPED ANY MORE: "a file passes through" read as "everything passes through".
# Reddens: file-exports: "while the same report run for the screen still arrives in the envelope: { data: { rows }, error: null }"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = '        if (isRawBody(handler, data)) return data\n'
b = '        if (isRawBody(handler, data) || data !== undefined) return data\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-3-nothing-wrapped: applied")
