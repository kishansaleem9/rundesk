# A SHARE THAT OPENS NOTHING, in the walk every list read uses.
# Reddens: unit: doc-access.test.ts "opens a shared doc and every page under it, and nothing above it"
import io
p = '/home/user/rundesk/apps/api/src/common/permissions/doc-access.ts'
a = '    shared: shared.has(row.id),\n'
b = '    shared: false,\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("dac-1-shares-open-nothing: applied")
