# PATCH AS IT WAS: the body spread into the row. Moves the doc into another
# workspace, rewrites its creator, and mints a public link past the block.
# Reddens: doc-boundaries: "a doc cannot be moved into another workspace by naming it"
import io
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.controller.ts'
a = '    if (unknown.length > 0) {\n'
b = '    if (false) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
p = '/home/user/rundesk/apps/api/src/modules/docs/docs.service.ts'
a = '    const writable = pickDocUpdatable(patch)\n'
b = '    const { expectedUpdatedAt: _v, ...writable } = patch\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("db-2-both-layers-spread: applied")
