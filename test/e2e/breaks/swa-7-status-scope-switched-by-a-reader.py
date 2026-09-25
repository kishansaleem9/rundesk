# WHOSE STATUSES A LIST USES IS SWITCHED BY ANYONE WHO CAN READ IT: the guard is off
# the status-scope route.
# Reddens: status-write-access: "a list in a view-only space keeps its statuses when a member switches them (403, unchanged) — the admin switches them"
import io
p = '/home/user/rundesk/apps/api/src/modules/lists/lists.controller.ts'
s = io.open(p, encoding='utf-8').read()
a = '  @UseGuards(StatusShapeGuard)\n  async setStatusScope('
b = '  async setStatusScope('
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8').write(s)
print('swa-7-status-scope-switched-by-a-reader: status scope unguarded')
