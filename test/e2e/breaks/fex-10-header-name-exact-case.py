# THE DECLARED HEADER IS MATCHED IN ONE SPELLING ONLY: `@Header('content-type', …)` is not recognised.
# Reddens: unit: response.interceptor.test.ts "sends what a route declared text/csv as it is, whatever the case of the header name"
import io
p = '/home/user/rundesk/apps/api/src/common/interceptors/response.interceptor.ts'
a = "  const type = declared?.find((h) => h.name.toLowerCase() === 'content-type')?.value\n"
b = "  const type = declared?.find((h) => h.name === 'Content-Type')?.value\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("fex-10-header-name-exact-case: applied")
