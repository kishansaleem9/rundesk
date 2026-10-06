# SOMEBODY ELSE'S PRIVATE VIEW IS ANYBODY'S TO CHANGE who has its id.
# Reddens: unit: view-write.test.ts "somebody else’s private view is nobody else’s to change, a manager’s neither"
import io
p = '/home/user/rundesk/apps/api/src/modules/views/view-write.ts'
a = "  if (view.visibility === 'private') return mine ? null : 'private'\n"
b = "  if (view.visibility === 'private') return null\n"
s = io.open(p, encoding='utf-8').read()
assert s.count(a) == 1, f'anchor appears {s.count(a)} times in {p}, expected exactly 1'
io.open(p, 'w', encoding='utf-8').write(s.replace(a, b))
print("vwl-22-anybodys-private-view-is-theirs-unit: somebody else's private view is anybody's to change who has its id")
