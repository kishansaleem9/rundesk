# THE SERVER REFUSES NULL: an emptied box is answered 400 and the old prefix stays.
# Reddens: planner-prefix: "clearing it goes back to the default — the server keeps no prefix, and after a reload the box reads \"Work on\""
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = '    if (patch.blockPrefix !== undefined && patch.blockPrefix !== null) {\n'
b = '    if (patch.blockPrefix !== undefined) {\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ppx-2-null-refused: null is refused')
