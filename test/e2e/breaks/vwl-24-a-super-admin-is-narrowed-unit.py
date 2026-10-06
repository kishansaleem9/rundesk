# A SUPER-ADMIN IS NARROWED BY THE LIST'S LEVEL, where every rule lets them past.
# Reddens: unit: view-write.test.ts "a super-admin is not narrowed"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (actor.role === 'super_admin') return null\n  const mine = view.createdById === actor.id\n"
b = '  const mine = view.createdById === actor.id\n'
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-24-a-super-admin-is-narrowed-unit: a super-admin is narrowed by the list's level, where every rule lets them past")
