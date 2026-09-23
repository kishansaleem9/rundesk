# THE ROUTE'S REFUSAL REMOVED. The service still drops what it may not write, so
# nothing is stored — but a client sending publicShareId gets a 200 and no link,
# instead of being told where public links are made.
# Reddens: doc-boundaries: "a public link cannot be minted through PATCH — refused with the share route named, and the link does not answer"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.controller.ts'
a = '    if (unknown.length > 0) {\n'
b = '    if (false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-1-route-drops-silently: applied")
