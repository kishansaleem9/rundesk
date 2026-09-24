# ANY LENGTH IS SAVED: a paragraph becomes the start of every block's title.
# Reddens: planner-prefix: "a prefix longer than 40 characters is refused, and the one held stays"
import io
p = '/home/user/rundesk/apps/api/src/modules/planner/planner.service.ts'
a = "      if (typeof patch.blockPrefix !== 'string' || patch.blockPrefix.trim().length > 40) {\n"
b = "      if (typeof patch.blockPrefix !== 'string') {\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print('ppx-3-any-length: any length is saved')
